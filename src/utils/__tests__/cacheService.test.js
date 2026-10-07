/**
 * Unit tests for the AsyncStorage cache layer (mirrors
 * src/utils/cache/cacheService.ts + cacheInvalidation.ts).
 *
 * Run with: node src/utils/__tests__/cacheService.test.js
 * Mirror pattern (see readBudget.test.js): the storage backend is faked with
 * an in-memory Map and time is threaded through explicitly (no Date.now
 * patching), so the TTL/SWR/dedupe/tag decision logic runs under plain
 * `node:test` with no firebase/RN imports.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── In-memory AsyncStorage fake ───────────────────────────────────────────

function makeStorage() {
  const store = new Map();
  return {
    getItem: async (k) => (store.has(k) ? store.get(k) : null),
    setItem: async (k, v) => void store.set(k, String(v)),
    removeItem: async (k) => void store.delete(k),
    raw: store,
  };
}

// ── Mirrored logic (src/utils/cache/cacheService.ts) ──────────────────────

const CACHE_TTLS = {
  propertyDetail: 5 * 60_000,
  userProfile: 15 * 60_000,
  neighborhood: 7 * 24 * 60 * 60_000,
  savedSearches: 60_000,
  agentProfile: 5 * 60_000,
  relatedProperties: 5 * 60_000,
};

const CACHE_PREFIX = 'cache:v1:';
const TAG_INDEX_KEY = CACHE_PREFIX + '__tags';

function buildCacheKey(...parts) {
  return CACHE_PREFIX + parts.join(':');
}

/**
 * Cache harness: an isolated store + clock per test. `now` is advanced
 * explicitly with `advance(ms)`.
 */
function makeCache() {
  const storage = makeStorage();
  let now = 1_800_000_000_000;
  const fetchCounts = new Map();

  const advance = (ms) => {
    now += ms;
  };

  const getCache = async (key) => {
    try {
      const raw = await storage.getItem(key);
      if (!raw) return null;
      const e = JSON.parse(raw);
      if (typeof e.cachedAt !== 'number' || typeof e.ttlMs !== 'number') return null;
      const ageMs = now - e.cachedAt;
      if (ageMs < 0) return null; // clock rollback → miss (mirror of source)
      return { data: e.value, ageMs }; // expired entries ARE returned (SWR)
    } catch {
      return null; // corrupt entry → miss
    }
  };

  const setCache = async (key, value, ttlMs, tags = []) => {
    await storage.setItem(key, JSON.stringify({ value, cachedAt: now, ttlMs }));
    if (tags.length > 0) {
      const raw = await storage.getItem(TAG_INDEX_KEY);
      const index = raw ? JSON.parse(raw) : {};
      for (const tag of tags) {
        const keys = index[tag] ?? [];
        if (!keys.includes(key)) index[tag] = [...keys, key];
      }
      await storage.setItem(TAG_INDEX_KEY, JSON.stringify(index));
    }
  };

  /** Mirrors cachedRead: SWR + in-flight dedupe, counting fetches per key. */
  const inflight = new Map();
  const cachedRead = async (key, ttlMs, fetcher, options = {}) => {
    const existing = inflight.get(key);
    if (existing) return existing;

    const run = async () => {
      const cached = await getCache(key);
      if (cached) {
        if (cached.ageMs < ttlMs) {
          return { data: cached.data, fromCache: true };
        }
        const swr = options.staleWhileRevalidate !== false;
        if (swr) {
          fetcher()
            .then((data) => {
              fetchCounts.set(key, (fetchCounts.get(key) ?? 0) + 1);
              if (data != null) void setCache(key, data, ttlMs, options.tags);
            })
            .catch(() => {});
          return { data: cached.data, fromCache: true, stale: true };
        }
      }
      const data = await fetcher();
      fetchCounts.set(key, (fetchCounts.get(key) ?? 0) + 1);
      if (data != null) await setCache(key, data, ttlMs, options.tags);
      return { data, fromCache: false };
    };

    const promise = run().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  };

  /** Mirrors invalidateByTags. */
  const invalidateByTags = async (tags) => {
    if (tags.length === 0) return;
    const raw = await storage.getItem(TAG_INDEX_KEY);
    const index = raw ? JSON.parse(raw) : {};
    const keys = new Set();
    for (const tag of tags) for (const key of index[tag] ?? []) keys.add(key);
    await Promise.all([...keys].map((k) => storage.removeItem(k)));
    const next = {};
    for (const [tag, taggedKeys] of Object.entries(index)) {
      const remaining = taggedKeys.filter((k) => !keys.has(k));
      if (remaining.length > 0) next[tag] = remaining;
    }
    await storage.setItem(TAG_INDEX_KEY, JSON.stringify(next));
  };

  const fetchCount = (key) => fetchCounts.get(key) ?? 0;

  return { storage, advance, getCache, setCache, cachedRead, invalidateByTags, fetchCount };
}

// ── TTL freshness ─────────────────────────────────────────────────────────

describe('TTL freshness', () => {
  test('fresh entry (within TTL) is returned from cache', async () => {
    const c = makeCache();
    const key = buildCacheKey('properties', 'detail', 'p1');
    await c.setCache(key, { price: 100 }, CACHE_TTLS.propertyDetail);
    c.advance(4 * 60_000); // 4 of 5 minutes — fresh

    const hit = await c.getCache(key);
    assert.ok(hit, 'expected a cache hit');
    assert.equal(hit.data.price, 100);
    assert.equal(hit.ageMs, 4 * 60_000);
  });

  test('entry exactly at TTL age is returned as stale data for SWR callers', async () => {
    const c = makeCache();
    const key = buildCacheKey('k');
    await c.setCache(key, 'v', 60_000);
    c.advance(60_000); // age == ttl → stale but still served (getCache no longer evicts)
    const hit = await c.getCache(key);
    assert.ok(hit);
    assert.equal(hit.ageMs, 60_000);
    // The caller's freshness decision: ageMs >= ttlMs means stale.
    assert.ok(hit.ageMs >= 60_000);
  });

  test('expired entries are NOT evicted on read — they feed stale-while-revalidate', async () => {
    const c = makeCache();
    const key = buildCacheKey('k');
    await c.setCache(key, 'stale-v', 60_000);
    c.advance(60_001);
    const hit = await c.getCache(key);
    assert.ok(hit, 'expired copy must survive the read so it can be served stale');
    assert.equal(hit.data, 'stale-v');
    // Purged only by explicit invalidation.
    await c.invalidateByTags(['x']);
    assert.ok(await c.getCache(key), 'unrelated tag invalidation must not touch it');
  });

  test('each TTL config value matches the spec', () => {
    assert.equal(CACHE_TTLS.propertyDetail, 5 * 60_000, 'property detail: 5 min');
    assert.equal(CACHE_TTLS.userProfile, 15 * 60_000, 'user profile: 15 min');
    assert.equal(CACHE_TTLS.neighborhood, 7 * 24 * 60 * 60_000, 'neighborhood: 7 days');
    assert.equal(CACHE_TTLS.savedSearches, 60_000, 'saved searches: 60s');
    assert.equal(CACHE_TTLS.agentProfile, 5 * 60_000, 'agent profile: 5 min');
    assert.equal(CACHE_TTLS.relatedProperties, 5 * 60_000, 'similar/recently-sold: 5 min');
  });

  test('clock rollback (negative age) is treated as a miss', async () => {
    const c = makeCache();
    const key = buildCacheKey('k');
    await c.setCache(key, 'v', 60_000);
    c.advance(-5_000);
    assert.equal(await c.getCache(key), null);
  });

  test('corrupt entries are treated as misses, never thrown', async () => {
    const c = makeCache();
    const key = buildCacheKey('k');
    await c.storage.setItem(key, '{not json');
    assert.equal(await c.getCache(key), null);
  });
});

// ── cachedRead behavior ───────────────────────────────────────────────────

describe('cachedRead', () => {
  test('first call misses and fetches; second visit within TTL issues ZERO fetches (acceptance)', async () => {
    const c = makeCache();
    const key = buildCacheKey('properties', 'detail', 'p1');
    const fetcher = async () => ({ id: 'p1', price: 420_000 });

    const first = await c.cachedRead(key, CACHE_TTLS.propertyDetail, fetcher, {
      tags: ['property:p1'],
    });
    assert.equal(first.fromCache, false);
    assert.equal(c.fetchCount(key), 1);

    // Second visit 4 minutes later (inside the 5-min window).
    c.advance(4 * 60_000);
    const second = await c.cachedRead(key, CACHE_TTLS.propertyDetail, fetcher, {
      tags: ['property:p1'],
    });
    assert.equal(second.fromCache, true);
    assert.equal(c.fetchCount(key), 1, 'second visit within the TTL must not fetch');
  });

  test('visit after the TTL expires refetches (stale-while-revalidate)', async () => {
    const c = makeCache();
    const key = buildCacheKey('properties', 'detail', 'p1');
    const fetcher = async () => ({ id: 'p1', price: 420_000 });

    await c.cachedRead(key, CACHE_TTLS.propertyDetail, fetcher, { tags: ['property:p1'] });
    c.advance(CACHE_TTLS.propertyDetail + 1);

    const result = await c.cachedRead(key, CACHE_TTLS.propertyDetail, fetcher, {
      tags: ['property:p1'],
    });
    // Stale copy served instantly…
    assert.equal(result.stale, true);
    assert.equal(result.data.price, 420_000);
    // …and exactly one background revalidation was issued.
    await new Promise((r) => setImmediate(r)); // let the background fetch land
    assert.equal(c.fetchCount(key), 2);
  });

  test('stale entry returns immediately; background revalidation replaces it', async () => {
    const c = makeCache();
    const key = buildCacheKey('savedSearches', 'u1');
    await c.setCache(key, ['old'], CACHE_TTLS.savedSearches, ['savedSearches:u1']);
    c.advance(CACHE_TTLS.savedSearches + 1_000);

    let resolveFetch;
    const fetcher = () => new Promise((resolve) => (resolveFetch = resolve));

    const result = await c.cachedRead(key, CACHE_TTLS.savedSearches, fetcher, {
      tags: ['savedSearches:u1'],
    });
    assert.equal(result.stale, true, 'stale data must be served without blocking');
    assert.equal(result.fromCache, true);
    assert.deepEqual(result.data, ['old']);

    resolveFetch(['new']);
    await new Promise((r) => setImmediate(r));
    const refreshed = await c.getCache(key);
    assert.deepEqual(refreshed.data, ['new']);
  });

  test('failed background revalidation keeps serving the stale entry', async () => {
    const c = makeCache();
    const key = buildCacheKey('savedSearches', 'u1');
    await c.setCache(key, ['stale'], CACHE_TTLS.savedSearches, ['savedSearches:u1']);
    c.advance(CACHE_TTLS.savedSearches + 1_000);

    const result = await c.cachedRead(key, CACHE_TTLS.savedSearches, async () => {
      throw new Error('offline');
    }, { tags: ['savedSearches:u1'] });
    assert.equal(result.stale, true);
    const still = await c.getCache(key);
    assert.deepEqual(still.data, ['stale']);
  });

  test('concurrent identical reads share ONE in-flight fetch (dedupe)', async () => {
    const c = makeCache();
    const key = buildCacheKey('users', 'profile', 'u9');
    let resolveFetch;
    const fetcher = () =>
      new Promise((resolve) => {
        resolveFetch = resolve;
      });

    const pending = [
      c.cachedRead(key, CACHE_TTLS.userProfile, fetcher),
      c.cachedRead(key, CACHE_TTLS.userProfile, fetcher),
      c.cachedRead(key, CACHE_TTLS.userProfile, fetcher),
    ];
    // Let run() reach `await fetcher()` before resolving it.
    await new Promise((r) => setImmediate(r));
    resolveFetch({ uid: 'u9', displayName: 'Agent' });
    const results = await Promise.all(pending);

    assert.equal(c.fetchCount(key), 1, 'identical in-flight reads must dedupe to one fetch');
    assert.equal(results[0].data.displayName, 'Agent');
    assert.equal(results[1].data.displayName, 'Agent');
    assert.equal(results[2].data.displayName, 'Agent');
  });

  test('sequential (not concurrent) calls after a miss hit the fresh cache', async () => {
    const c = makeCache();
    const key = buildCacheKey('users', 'profile', 'u9');
    const fetcher = async () => ({ uid: 'u9' });
    await c.cachedRead(key, CACHE_TTLS.userProfile, fetcher);
    await c.cachedRead(key, CACHE_TTLS.userProfile, fetcher);
    await c.cachedRead(key, CACHE_TTLS.userProfile, fetcher);
    assert.equal(c.fetchCount(key), 1);
  });

  test('null fetcher result is returned but never cached', async () => {
    const c = makeCache();
    const key = buildCacheKey('properties', 'detail', 'gone');
    let fetches = 0;
    const nullFetcher = async () => {
      fetches += 1;
      return null;
    };
    const result = await c.cachedRead(key, CACHE_TTLS.propertyDetail, nullFetcher);
    assert.equal(result.data, null);
    assert.equal(await c.storage.getItem(key), null);

    await c.cachedRead(key, CACHE_TTLS.propertyDetail, nullFetcher);
    assert.equal(fetches, 2, 'null results must not poison the cache');
  });
});

// ── Tag-based invalidation ────────────────────────────────────────────────

describe('tag invalidation', () => {
  test('invalidateByTags purges every entry carrying the tag across key namespaces', async () => {
    const c = makeCache();
    await c.setCache(buildCacheKey('properties', 'detail', 'p1'), 'detail', CACHE_TTLS.propertyDetail, ['property:p1']);
    await c.setCache(buildCacheKey('properties', 'similar', 'p1'), 'similar', CACHE_TTLS.relatedProperties, ['property:p1']);
    await c.setCache(buildCacheKey('properties', 'soldNearby', 'p1'), 'sold', CACHE_TTLS.relatedProperties, ['property:p1']);
    await c.setCache(buildCacheKey('users', 'profile', 'u2'), 'profile', CACHE_TTLS.userProfile, ['user:u2']);

    await c.invalidateByTags(['property:p1']);

    assert.equal(await c.getCache(buildCacheKey('properties', 'detail', 'p1')), null);
    assert.equal(await c.getCache(buildCacheKey('properties', 'similar', 'p1')), null);
    assert.equal(await c.getCache(buildCacheKey('properties', 'soldNearby', 'p1')), null);
    // Other namespaces survive.
    const untouched = await c.getCache(buildCacheKey('users', 'profile', 'u2'));
    assert.equal(untouched.data, 'profile');
  });

  test('multi-tag entries are purged once and removed from every index bucket', async () => {
    const c = makeCache();
    const key = buildCacheKey('users', 'profile', 'u3');
    await c.setCache(key, 'me', CACHE_TTLS.userProfile, ['user:u3', 'properties:list']);

    await c.invalidateByTags(['user:u3']);
    assert.equal(await c.getCache(key), null);

    const index = JSON.parse(await c.storage.getItem(TAG_INDEX_KEY));
    assert.deepEqual(index['user:u3'] ?? [], []);
    assert.deepEqual(index['properties:list'] ?? [], []);
  });

  test('user-tag invalidation clears profile + peer rating (profile-edit scenario)', async () => {
    const c = makeCache();
    await c.setCache(buildCacheKey('users', 'profile', 'u4'), 'profileV1', CACHE_TTLS.userProfile, ['user:u4']);
    await c.setCache(
      buildCacheKey('userReviews', 'rating', 'u4'),
      { averageRating: 4.5 },
      CACHE_TTLS.agentProfile,
      ['user:u4']
    );

    // EditProfileScreen → updateUserProfile → invalidateUserTags(`user:u4`).
    await c.invalidateByTags([`user:u4`]);

    assert.equal(await c.getCache(buildCacheKey('users', 'profile', 'u4')), null);
    assert.equal(await c.getCache(buildCacheKey('userReviews', 'rating', 'u4')), null);
  });

  test('saved-search mutation clears only that user’s list', async () => {
    const c = makeCache();
    await c.setCache(buildCacheKey('savedSearches', 'uA'), ['a'], CACHE_TTLS.savedSearches, ['savedSearches:uA']);
    await c.setCache(buildCacheKey('savedSearches', 'uB'), ['b'], CACHE_TTLS.savedSearches, ['savedSearches:uB']);

    await c.invalidateByTags(['savedSearches:uA']);

    assert.equal(await c.getCache(buildCacheKey('savedSearches', 'uA')), null);
    const other = await c.getCache(buildCacheKey('savedSearches', 'uB'));
    assert.deepEqual(other.data, ['b']);
  });

  test('invalidating an unknown tag or empty tag list is a safe no-op', async () => {
    const c = makeCache();
    await c.invalidateByTags(['property:does-not-exist']);
    await c.invalidateByTags([]);
  });

  test('after tag invalidation the next read fetches fresh data', async () => {
    const c = makeCache();
    const key = buildCacheKey('properties', 'detail', 'p5');
    let value = 'v1';
    await c.cachedRead(key, CACHE_TTLS.propertyDetail, async () => value, { tags: ['property:p5'] });

    value = 'v2'; // mutation lands…
    await c.invalidateByTags(['property:p5']); // …and invalidation purges.

    const next = await c.cachedRead(key, CACHE_TTLS.propertyDetail, async () => value, {
      tags: ['property:p5'],
    });
    assert.equal(next.data, 'v2');
    assert.equal(next.fromCache, false);
  });

  test('property edit → invalidatePropertyTags clears detail + similar + sold-nearby together', async () => {
    const c = makeCache();
    const tag = 'property:p6';
    await c.setCache(buildCacheKey('properties', 'detail', 'p6'), 'd', CACHE_TTLS.propertyDetail, [tag]);
    await c.setCache(buildCacheKey('properties', 'similar', 'p6'), 's', CACHE_TTLS.relatedProperties, [tag]);
    await c.setCache(buildCacheKey('properties', 'soldNearby', 'p6'), 'r', CACHE_TTLS.relatedProperties, [tag]);

    // Mirrors updateProperty → invalidatePropertyTags(id).
    await c.invalidateByTags([tag, 'properties:list']);

    assert.equal(await c.getCache(buildCacheKey('properties', 'detail', 'p6')), null);
    assert.equal(await c.getCache(buildCacheKey('properties', 'similar', 'p6')), null);
    assert.equal(await c.getCache(buildCacheKey('properties', 'soldNearby', 'p6')), null);
  });
});
