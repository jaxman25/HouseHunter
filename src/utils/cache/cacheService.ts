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

/** TTL for user profiles (1 hour). */
export const PROFILE_CACHE_TTL_MS = 60 * 60_000;

/** TTL for property detail documents (5 minutes). */
export const PROPERTY_DETAIL_CACHE_TTL_MS = 5 * 60_000;

const CACHE_PREFIX = 'cache:v1:';

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
 * @returns The cached value plus its age, or `null` if missing/expired/corrupt.
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
    if (ageMs < 0 || ageMs >= entry.ttlMs) {
      // Expired — drop it and let the caller refetch.
      await AsyncStorage.removeItem(key);
      return null;
    }

    return { data: entry.value, ageMs };
  } catch {
    // Corrupt or unreadable entry — treat as a miss.
    return null;
  }
}

/** Write a value to the cache with a TTL. */
export async function setCache<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const entry: CacheEntry<T> = { value, cachedAt: Date.now(), ttlMs };
  try {
    await AsyncStorage.setItem(key, serialize(entry));
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
  options: { staleWhileRevalidate?: boolean } = {}
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
            void setCache(key, data, ttlMs);
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
    await setCache(key, data, ttlMs);
  }
  return { data, fromCache: false };
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