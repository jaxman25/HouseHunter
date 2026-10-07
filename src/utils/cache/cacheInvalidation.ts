/**
 * Cache invalidation — purge cached entries after mutations so stale data
 * never survives a create/update/delete.
 *
 * Call these from the service layer after a successful write:
 *  - create/update/delete property → `invalidatePropertiesCache()`
 *  - property detail edited         → `invalidatePropertyDetail(id)`
 *  - user profile updated           → `invalidateUserProfile(uid)`
 *  - favorites changed              → `invalidateFavorites(uid)`
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildCacheKey, removeCache, getTagIndex } from './cacheService';

/**
 * Tag-based invalidation: entries opt in via `tags` at write time (setCache /
 * cachedRead), and mutations purge EVERY entry carrying the tag — no manual
 * key lists at call sites.
 *
 * Convention:
 *   - `property:${id}`  — anything derived from one listing (detail, similar,
 *     recently-sold nearby, price history)
 *   - `properties:list` — any listing-list surface (browse pages, owner lists)
 *   - `user:${uid}`     — one user's profile-derived data (profile doc, peer
 *     rating, agent-profile bundle)
 *   - `savedSearches:${uid}` — a user's saved-search list
 *   - `neighborhood:insights` — every cached Overpass insights read (bulk
 *     clear only; 7-day data is otherwise left to age out)
 */
export async function invalidateByTags(tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  try {
    const index = await getTagIndex();
    const keys = new Set<string>();
    for (const tag of tags) {
      for (const key of index[tag] ?? []) keys.add(key);
    }
    if (keys.size > 0) {
      await Promise.all([...keys].map((key) => removeCache(key)));
    }
    // Drop the purged keys from the index.
    const next: Record<string, string[]> = {};
    for (const [tag, taggedKeys] of Object.entries(index)) {
      const remaining = taggedKeys.filter((key) => !keys.has(key));
      if (remaining.length > 0) next[tag] = remaining;
    }
    await AsyncStorage.setItem(
      buildCacheKey('__tags'),
      JSON.stringify(next)
    );
  } catch (error) {
    console.warn('[cache] Tag invalidation failed:', error);
  }
}

/** Remove every cache entry whose key starts with `prefix`. */
export async function invalidateByPrefix(prefix: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const toRemove = keys.filter((key) => key.startsWith(prefix));
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch (error) {
    console.warn('[cache] Failed to invalidate cache:', error);
  }
}

/** Invalidate all cached property listings (list pages + details). */
export function invalidatePropertiesCache(): Promise<void> {
  return invalidateByPrefix(buildCacheKey('properties'));
}

/** Invalidate a single property detail entry. */
export function invalidatePropertyDetail(id: string): Promise<void> {
  return removeCache(buildCacheKey('properties', 'detail', id));
}

/** Invalidate everything tagged to one property (detail + derived sections). */
export function invalidatePropertyTags(id: string): Promise<void> {
  return invalidateByTags([`property:${id}`, 'properties:list']);
}

/** Invalidate a user's profile-derived cached reads. */
export function invalidateUserTags(uid: string): Promise<void> {
  return invalidateByTags([`user:${uid}`]);
}

/** Invalidate a user's saved-search list cache. */
export function invalidateSavedSearchesTags(uid: string): Promise<void> {
  return invalidateByTags([`savedSearches:${uid}`]);
}

/** Invalidate a single user's cached profile. */
export function invalidateUserProfile(uid: string): Promise<void> {
  return removeCache(buildCacheKey('users', 'profile', uid));
}

/** Invalidate a single user's cached favorites. */
export function invalidateFavorites(uid: string): Promise<void> {
  return removeCache(buildCacheKey('users', 'favorites', uid));
}

/** Invalidate every cached entry (e.g. after sign-out). */
export function invalidateAllCache(): Promise<void> {
  return invalidateByPrefix(buildCacheKey());
}