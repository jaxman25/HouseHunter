import AsyncStorage from '@react-native-async-storage/async-storage';
import { RecentlyViewedItem } from '../types';

/**
 * Locally stored history of recently viewed properties.
 *
 * Non-critical, per-device data: everything here degrades gracefully. Reads
 * return `[]` and writes no-op on failure (logged via console.warn), so a
 * storage problem never blocks browsing.
 *
 * The list is stored newest-first (index 0 = most recently viewed). `merge`
 * dedupes by propertyId (re-viewing moves an item to the front) and evicts
 * the oldest entries FIFO once the list exceeds MAX_ITEMS.
 *
 * Works on web via AsyncStorage's localStorage backend.
 */

/** Key under which the list is persisted. Versioned for future migrations. */
const STORAGE_KEY = '@house_hunter/recently_viewed_v1';

/** Maximum number of properties kept. */
export const RECENTLY_VIEWED_MAX = 20;

/** Read the stored list (newest first). Never throws. */
export async function readRecentlyViewed(): Promise<RecentlyViewedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentlyViewedItem[]) : [];
  } catch (error) {
    console.warn('Failed to read recently viewed:', error);
    return [];
  }
}

/**
 * Merge incoming items into the stored list and persist the result.
 *
 * `items` may arrive in any order (the hook batches debounced views); the
 * newest view wins, so each item's position reflects the order given here —
 * the caller passes its pending batch oldest-first, and `items` reversed
 * becomes the new front of the list. Existing entries are appended after,
 * deduped (incoming wins), and the tail is trimmed to `RECENTLY_VIEWED_MAX`.
 *
 * Returns the resulting list (newest first). Never throws.
 */
export async function mergeRecentlyViewed(
  items: RecentlyViewedItem[]
): Promise<RecentlyViewedItem[]> {
  if (items.length === 0) return readRecentlyViewed();
  try {
    const existing = await readRecentlyViewed();
    const merged: RecentlyViewedItem[] = [];
    const seen = new Set<string>();
    for (const item of [...items].reverse().concat(existing)) {
      if (seen.has(item.propertyId)) continue;
      seen.add(item.propertyId);
      merged.push(item);
      if (merged.length >= RECENTLY_VIEWED_MAX) break;
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch (error) {
    console.warn('Failed to save recently viewed:', error);
    return readRecentlyViewed();
  }
}

/** Remove a single property from the history (e.g. the listing was deleted). */
export async function removeRecentlyViewed(propertyId: string): Promise<void> {
  if (!propertyId) return;
  try {
    const existing = await readRecentlyViewed();
    const next = existing.filter((item) => item.propertyId !== propertyId);
    if (next.length === existing.length) return;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('Failed to remove recently viewed item:', error);
  }
}

/** Wipe the entire history. Never throws. */
export async function clearRecentlyViewed(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear recently viewed:', error);
  }
}