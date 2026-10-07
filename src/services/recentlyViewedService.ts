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

/** Time-based view debounce window. A view is counted again once this long
 * has elapsed since `shouldCountView` last accepted it. 24h keeps repeat
 * visits to the same listing from inflating `views` (see
 * `properties/{id}/viewEvents/{uid}_{yyyy-mm-dd}`).
 */
export const VIEW_COUNT_TTL_MS = 24 * 60 * 60 * 1000;

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

/**
 * Record that `propertyId` was counted as a view. Called by the service
 * layer (or its Cloud Function trigger) after the server-side view event is
 * written, so the 24h window is keyed on the view hit, not on storage.
 * Never throws.
 *
 * @param now Optional timestamp to stamp the entry with (defaults to
 *             `Date.now()`). Used by unit tests to drive the 24h window
 *             deterministically.
 */
export async function markViewCounted(
  propertyId: string,
  now: number = Date.now()
): Promise<void> {
  if (!propertyId) return;
  try {
    await AsyncStorage.setItem(`viewCounted:${propertyId}`, String(now));
  } catch (error) {
    console.warn('Failed to record viewed property:', error);
  }
}

/**
 * Whether the current user may count a view for `propertyId`.
 *
 * Returns `true` when no `viewCounted:{propertyId}` entry exists, or when the
 * stored timestamp is older than `VIEW_COUNT_TTL_MS` (24h). Returns `false`
 * when a fresh entry exists, suppressing the client-side view increment so
 * the count is emitted exactly once per user per property per day.
 *
 * @param now Optional timestamp to compare against (defaults to
 *            `Date.now()`). Used by unit tests to drive the 24h window
 *            deterministically.
 *
 * Read errors never propagate: a missing store is treated as "allow".
 */
export async function shouldCountView(
  propertyId: string,
  now: number = Date.now()
): Promise<boolean> {
  if (!propertyId) return true;
  try {
    const raw = await AsyncStorage.getItem(`viewCounted:${propertyId}`);
    if (!raw) return true;
    const timestamp = Number(raw);
    if (!Number.isFinite(timestamp)) return true;
    // Compare against the injected `now` (defaults to Date.now()) so callers
    // and tests can drive the window deterministically. At exactly 24h the
    // window has elapsed, so the view may be counted again.
    return now - timestamp >= VIEW_COUNT_TTL_MS;
  } catch (error) {
    // Storage is non-critical; treat a read failure as "allow count".
    console.warn('Failed to read view-count cache:', error);
    return true;
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
