import { useCallback, useEffect, useState } from 'react';
import { Property, RecentlyViewedItem } from '../types';
import { getProperty } from '../services/propertyService';
import {
  clearRecentlyViewed,
  mergeRecentlyViewed,
  readRecentlyViewed,
  removeRecentlyViewed,
} from '../services/recentlyViewedService';
import { debounce } from '../utils/performance/debounce';

/**
 * Recently-viewed tracking.
 *
 * `trackPropertyView(propertyId, property?)` records a detail-page visit and
 * `getRecentlyViewed()` reads the history back (both non-React, usable from
 * any screen). The React hook `useRecentlyViewed()` exposes state for
 * sections/screens that render the history.
 *
 * Writes are debounced (via utils/performance/debounce): a burst of views is
 * coalesced into a single AsyncStorage write after `TRACK_DEBOUNCE_MS` of
 * quiet, while still recording every property viewed (the pending batch is
 * flushed as a whole, not just the last call). Reading flushes any pending
 * batch first, so the returned list is always current. Non-critical: every
 * failure is caught and logged with console.warn.
 */

/** Quiet period before a batch of views is persisted. */
const TRACK_DEBOUNCE_MS = 800;

/** Views queued for the next debounced write (insertion order = oldest first). */
let pendingViews = new Map<string, RecentlyViewedItem>();

function toItem(property: Property): RecentlyViewedItem {
  return {
    propertyId: property.id,
    title: property.title,
    price: property.price,
    listingType: property.listingType,
    propertyType: property.propertyType,
    status: property.status,
    images: property.images ?? [],
    city: property.city,
    state: property.state,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    area: property.area,
    areaUnit: property.areaUnit,
    viewedAt: new Date().toISOString(),
  };
}

function enqueue(item: RecentlyViewedItem): void {
  // delete-then-set moves an existing id to the back of the insertion order,
  // so a re-view is recorded as the newest entry.
  pendingViews.delete(item.propertyId);
  pendingViews.set(item.propertyId, item);
}

async function persistPending(): Promise<void> {
  if (pendingViews.size === 0) return;
  const batch = [...pendingViews.values()];
  pendingViews = new Map();
  try {
    await mergeRecentlyViewed(batch);
  } catch (error) {
    console.warn('Failed to persist recently viewed:', error);
  }
}

const flushPendingViews = debounce(() => {
  void persistPending();
}, TRACK_DEBOUNCE_MS);

/**
 * Record that a property detail page was viewed. Pass the loaded `property`
 * when available (avoids a refetch); otherwise the full property is fetched
 * by id and the snapshot is built from the result.
 */
export function trackPropertyView(
  propertyId: string,
  property?: Property | null
): void {
  if (!propertyId) return;

  if (property) {
    enqueue(toItem(property));
    flushPendingViews();
    return;
  }

  void getProperty(propertyId)
    .then((loaded) => {
      if (!loaded) return;
      enqueue(toItem(loaded));
      flushPendingViews();
    })
    .catch((error) => {
      console.warn('Failed to track recently viewed:', error);
    });
}

/**
 * Read the recently viewed history (newest first). Flushes any debounce-
 * pending views first so the result always reflects the latest visits.
 */
export async function getRecentlyViewed(): Promise<RecentlyViewedItem[]> {
  try {
    flushPendingViews.cancel();
    await persistPending();
    return await readRecentlyViewed();
  } catch (error) {
    console.warn('Failed to load recently viewed:', error);
    return [];
  }
}

/** React state for rendering the history (sections, full-screen lists). */
export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const list = await getRecentlyViewed();
      setItems(list);
    } catch (error) {
      console.warn('Failed to refresh recently viewed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // setState happens after the awaited service call, never synchronously
    // during the effect (see react-hooks/set-state-in-effect).
    const run = async () => {
      await refresh();
    };
    void run();
  }, [refresh]);

  const clearAll = useCallback(async () => {
    try {
      await clearRecentlyViewed();
      setItems([]);
    } catch (error) {
      console.warn('Failed to clear recently viewed:', error);
    }
  }, []);

  /** Remove one property from the local history (e.g. its listing was deleted). */
  const removeItem = useCallback(async (propertyId: string) => {
    try {
      await removeRecentlyViewed(propertyId);
      setItems((prev) => prev.filter((item) => item.propertyId !== propertyId));
    } catch (error) {
      console.warn('Failed to remove recently viewed item:', error);
    }
  }, []);

  return { items, loading, refresh, clearAll, removeItem };
}