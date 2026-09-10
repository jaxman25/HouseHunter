/**
 * Shared property-filter module — server-side counterpart of
 * src/services/propertyService.ts `fetchPropertiesPage()`.
 *
 * Builds a Firestore Admin SDK query from saved-search filter criteria,
 * matching the same semantics the client uses for browsing.  The goal is a
 * single source of truth so the scheduled saved-search job doesn't silently
 * drift from the live browse experience.
 */

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

// ─── Types (duplicated here to avoid importing client code) ────────────────

export type ListingType = 'sale' | 'rent';
export type PropertyType =
  | 'house'
  | 'apartment'
  | 'condo'
  | 'townhouse'
  | 'bedsitter'
  | 'maisonette'
  | 'land'
  | 'commercial';

export interface SavedSearchFilters {
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  propertyTypes?: PropertyType[];
  city?: string;
  state?: string;
  features?: string[];
  listingType?: ListingType;
  minArea?: number;
  maxArea?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'oldest' | 'popular';
}

interface PropertyDoc {
  bedrooms: number;
  bathrooms: number;
  area: number;
  features: string[];
  [key: string]: unknown;
}

// ─── Query builder ─────────────────────────────────────────────────────────

/**
 * Execute a saved-search query against the `properties` collection using
 * the Admin SDK.  Returns matching property document IDs.
 *
 * Filter semantics:
 *  - Status: exclude Inactive (mirrors the default browse).
 *  - Archived: exclude archived listings.
 *  - Listing type, property type, price, city, state → server-side WHERE.
 *  - Bedrooms, bathrooms, features, area → client-side post-filter (same
 *    as the client because Firestore can't combine range + equality
 *    efficiently without many composite indexes).
 *  - createdAt > since → only NEW matches since the last run.
 */
export async function executeSavedSearch(
  filters: SavedSearchFilters,
  since?: FirebaseFirestore.Timestamp
): Promise<{ ids: string[]; count: number }> {
  // Start with the base collection and chain query constraints.
  // The Admin SDK uses chained method calls, not standalone query functions.
  let q: FirebaseFirestore.Query = db
    .collection('properties')
    // Exclude Inactive and Archived (matches the default browse in the app).
    .where('status', 'in', ['active', 'pending', 'sold', 'rented'])
    .where('archived', '==', false) as FirebaseFirestore.Query;

  // ── Server-side equality / IN filters ─────────────────────────────────
  if (filters.listingType) {
    q = q.where('listingType', '==', filters.listingType);
  }
  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    q = q.where('propertyType', 'in', filters.propertyTypes);
  }
  if (filters.city) {
    q = q.where('city', '==', filters.city);
  }
  if (filters.state) {
    q = q.where('state', '==', filters.state);
  }

  // ── Price range (inequality — must be the sole range filter) ──────────
  if (filters.minPrice !== undefined) {
    q = q.where('price', '>=', filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    q = q.where('price', '<=', filters.maxPrice);
  }

  // ── New-only filter ───────────────────────────────────────────────────
  if (since) {
    q = q.where('createdAt', '>', since);
  }

  // ── Ordering (newest first by default — sensible for match detection) ─
  q = q.orderBy('createdAt', 'desc');

  // Cap at a generous upper bound to avoid runaway reads.
  q = q.limit(100);

  const snap = await q.get();

  // ── Client-side post-filters (bedrooms, bathrooms, features, area) ────
  const matched: string[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() as PropertyDoc;
    if (filters.minBedrooms !== undefined && d.bedrooms < filters.minBedrooms) continue;
    if (filters.maxBedrooms !== undefined && d.bedrooms > filters.maxBedrooms) continue;
    if (filters.minBathrooms !== undefined && d.bathrooms < filters.minBathrooms) continue;
    if (filters.maxBathrooms !== undefined && d.bathrooms > filters.maxBathrooms) continue;
    if (filters.features && filters.features.length > 0) {
      const hasAll = filters.features.every((f) => (d.features ?? []).includes(f));
      if (!hasAll) continue;
    }
    if (filters.minArea !== undefined && d.area < filters.minArea) continue;
    if (filters.maxArea !== undefined && d.area > filters.maxArea) continue;
    matched.push(doc.id);
  }

  return { ids: matched, count: matched.length };
}
