/**
 * AsyncStorage-backed caching layer with TTLs and stale-while-revalidate (SWR).
 *
 * Cache TTLs:
 *  - Property listings: 5 minutes
 *  - User profiles:     1 hour
 *
 * SWR strategy: when cached data is stale, return it immediately and refresh
 * in the background so the UI never blocks on a network round-trip.
 *
 * Firestore `Timestamp` values are serialized to ISO strings on write so
 * cached documents stay usable by `new Date(...)` / date-fns without the
 * Firebase SDK being involved.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** TTL for property listings (5 minutes). */
export const PROPERTY_CACHE_TTL_MS = 5 * 60_000;

/** TTL for user profiles (15 minutes). */
export const PROFILE_CACHE_TTL_MS = 15 * 60_000;

/** TTL for property detail documents (5 minutes). */
export const PROPERTY_DETAIL_CACHE_TTL_MS = 5 * 60_000;

const CACHE_PREFIX = 'cache:v1:';

/**
 * The single TTL config for read-only Firestore data. All cached reads
 * (cachedRead / getCachedOrFetch) take their TTL from here so retention
 * policy lives in one place.
 */
export const CACHE_TTLS = {
  /** Property detail documents. */
  propertyDetail: 5 * 60_000,
  /** User profiles. */
  userProfile: 15 * 60_000,
  /** Neighborhood profiles + Overpass insights (server-side data is 7d fresh too). */
  neighborhood: 7 * 24 * 60 * 60_000,
  /** Saved-search lists (must stay fresh-ish; mutations invalidate anyway). */
  savedSearches: 60_000,
  /** Public agent profile bundles (profile + rating). */
  agentProfile: 5 * 60_000,
  /** Similar-properties / recently-sold-nearby detail sections. */
  relatedProperties: 5 * 60_000,
} as const;

interface CacheEntry<T> {
  value: T;
  cachedAt: number;
  ttlMs: number;
}

export interface CacheResult<T> {
  data: T;
  fromCache: boolean;
  /** True when stale data was returned while a background refresh runs. */
  stale?: boolean;
}

/**
 * Build a namespaced cache key from parts, e.g.
 * `buildCacheKey('properties', 'list', '<filter>', '20')`.
 */
export function buildCacheKey(...parts: string[]): string {
  return CACHE_PREFIX + parts.join(':');
}

/**
 * Read a cache entry.
 *
 * @returns The cached value plus its age, or `null` if missing/corrupt.
 *   Expired entries are still returned — stale-while-revalidate needs them
 *   to serve instantly while a background fetch revalidates — so callers
 *   compare `ageMs` against their TTL. Expired copies are replaced by a
 *   successful refresh and purged by tag invalidation.
 */
export async function getCache<T>(key: string): Promise<{ data: T; ageMs: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (
      !entry ||
      typeof entry.cachedAt !== 'number' ||
      typeof entry.ttlMs !== 'number'
    ) {
      return null;
    }

    const ageMs = Date.now() - entry.cachedAt;
    // A clock rollback makes every entry look unborn — treat as a miss so we
    // never serve data with a negative age.
    if (ageMs < 0) {
      return null;
    }

    return { data: entry.value, ageMs };
  } catch {
    // Corrupt or unreadable entry — treat as a miss.
    return null;
  }
}

/** Write a value to the cache with a TTL (and optional invalidation tags). */
export async function setCache<T>(
  key: string,
  value: T,
  ttlMs: number,
  tags: string[] = []
): Promise<void> {
  const entry: CacheEntry<T> = { value, cachedAt: Date.now(), ttlMs };
  try {
    await AsyncStorage.setItem(key, serialize(entry));
    if (tags.length > 0) {
      await addToTagIndex(tags, key);
    }
  } catch (error) {
    console.warn('[cache] Failed to write cache entry:', error);
  }
}

/** Remove a single cache entry (no-op if missing). */
export async function removeCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.warn('[cache] Failed to remove cache entry:', error);
  }
}

/**
 * Stale-while-revalidate read:
 *  - fresh cache  → return cached data immediately.
 *  - stale cache  → return cached data immediately + refresh in background.
 *  - no cache     → await the fetcher, store the result, return it.
 *
 * `null`/`undefined` fetcher results are returned but never cached.
 */
export async function getCachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
  options: { staleWhileRevalidate?: boolean; tags?: string[] } = {}
): Promise<CacheResult<T>> {
  const cached = await getCache<T>(key);

  if (cached) {
    const isFresh = cached.ageMs < ttlMs;
    if (isFresh) {
      return { data: cached.data, fromCache: true };
    }

    const swr = options.staleWhileRevalidate !== false;
    if (swr) {
      // Background refresh — fire and forget, never reject the caller.
      fetcher()
        .then((data) => {
          if (data !== null && data !== undefined) {
            void setCache(key, data, ttlMs, options.tags);
          }
        })
        .catch(() => {
          // Keep serving stale data; the next call will retry.
        });
      return { data: cached.data, fromCache: true, stale: true };
    }
  }

  const data = await fetcher();
  if (data !== null && data !== undefined) {
    await setCache(key, data, ttlMs, options.tags);
  }
  return { data, fromCache: false };
}

// ─── In-flight dedupe ─────────────────────────────────────────────────────

/** key → promise of the in-flight read, so N simultaneous callers share one fetch. */
const inflight = new Map<string, Promise<CacheResult<unknown>>>();

/**
 * The DEFAULT read path for read-only Firestore data.
 *
 * Same stale-while-revalidate semantics as getCachedOrFetch, plus dedupe:
 * concurrent identical reads (same key) share a single in-flight fetch —
 * e.g. PropertyDetail deep-link + similar-section mount fire one network
 * read, not two. Fresh cache → zero Firestore reads.
 *
 * @param key    cache key (buildCacheKey)
 * @param ttlMs  retention window — use CACHE_TTLS
 * @param fetcher the Firestore read to run on miss/stale
 * @param tags   invalidation tags (see cacheInvalidation.invalidateByTags)
 */
export async function cachedRead<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  options: { staleWhileRevalidate?: boolean; tags?: string[] } = {}
): Promise<CacheResult<T>> {
  const existing = inflight.get(key) as Promise<CacheResult<T>> | undefined;
  if (existing) return existing;

  const promise = getCachedOrFetch(key, fetcher, ttlMs, options).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise as Promise<CacheResult<unknown>>);
  return promise;
}

/**
 * Produce a stable string representation of an object for use in cache keys,
 * with keys sorted so filter objects compare equal regardless of insertion order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** AsyncStorage key for the tag → keys index (tags enable bulk invalidation). */
const TAG_INDEX_KEY = CACHE_PREFIX + '__tags';

/** Record `key` under each tag in the persistent tag index. */
async function addToTagIndex(tags: string[], key: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(TAG_INDEX_KEY);
    const index = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    let changed = false;
    for (const tag of tags) {
      const keys = index[tag] ?? [];
      if (!keys.includes(key)) {
        index[tag] = [...keys, key];
        changed = true;
      }
    }
    if (changed) {
      await AsyncStorage.setItem(TAG_INDEX_KEY, JSON.stringify(index));
    }
  } catch {
    // Index corruption must never break a cache write.
  }
}

/** Read the tag index (test hook + invalidation). */
export async function getTagIndex(): Promise<Record<string, string[]>> {
  try {
    const raw = await AsyncStorage.getItem(TAG_INDEX_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

/**
 * Serialize a cache entry, converting Firestore `Timestamp` values — both
 * live instances and plain `{ seconds, nanoseconds }` shapes — into ISO date
 * strings so cached documents remain date-parseable without the Firebase SDK.
 */
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object') {
      const { seconds, nanoseconds } = v as { seconds?: unknown; nanoseconds?: unknown };
      if (typeof seconds === 'number' && typeof nanoseconds === 'number') {
        return new Date(seconds * 1000 + nanoseconds / 1_000_000).toISOString();
      }
    }
    return v;
  });
}