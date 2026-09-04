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
import { buildCacheKey, removeCache } from './cacheService';

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