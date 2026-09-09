import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Property, PropertyFilter, SavedSearch, SavedSearchFilters } from '../types';
import { SAVED_SEARCHES_COLLECTION, MAX_SAVED_SEARCHES } from '../utils/constants';
import { getProperties } from './propertyService';

/**
 * Saved searches: filter criteria a user stores under `users/{uid}/savedSearches`
 * so they can re-run them with one tap and get notified of new matches.
 *
 * New matches are counted server-side (functions/src/triggers/checkSavedSearches.ts
 * bumps `newMatchCount` when a new property matches); running the search clears
 * the badge. All failures surface to the caller (the hook catches them).
 */

function savedSearchesRef(userId: string) {
  return collection(db, 'users', userId, SAVED_SEARCHES_COLLECTION);
}

function searchRef(userId: string, searchId: string) {
  return doc(db, 'users', userId, SAVED_SEARCHES_COLLECTION, searchId);
}

function toISO(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === 'object') {
    const t = value as { seconds?: unknown; nanoseconds?: unknown };
    if (typeof t.seconds === 'number' && typeof t.nanoseconds === 'number') {
      return new Date(t.seconds * 1000 + t.nanoseconds / 1_000_000).toISOString();
    }
  }
  return value as string;
}

function toSavedSearch(docSnap: DocumentSnapshot): SavedSearch {
  const data = docSnap.data() as Omit<SavedSearch, 'id'>;
  return {
    ...data,
    id: docSnap.id,
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt),
    lastRunAt: data.lastRunAt ? toISO(data.lastRunAt) : undefined,
    lastNotifiedAt: data.lastNotifiedAt ? toISO(data.lastNotifiedAt) : undefined,
  };
}

export type SavedSearchInput = Pick<
  SavedSearch,
  'name' | 'filters' | 'notificationFrequency'
>;

export async function getSavedSearches(userId: string): Promise<SavedSearch[]> {
  const q = query(
    savedSearchesRef(userId),
    orderBy('updatedAt', 'desc'),
    limit(MAX_SAVED_SEARCHES)
  );
  const snap = await getDocs(q);
  const searches: SavedSearch[] = [];
  snap.forEach((docSnap) => searches.push(toSavedSearch(docSnap)));
  return searches;
}

export async function getSavedSearch(
  userId: string,
  searchId: string
): Promise<SavedSearch | null> {
  const snap = await getDoc(searchRef(userId, searchId));
  return snap.exists() ? toSavedSearch(snap) : null;
}

/** Create a saved search. Rejects (throws) once the 50-search cap is hit. */
export async function createSavedSearch(
  userId: string,
  input: SavedSearchInput
): Promise<SavedSearch> {
  const existing = await getSavedSearches(userId);
  if (existing.length >= MAX_SAVED_SEARCHES) {
    throw new Error(`You've reached the maximum of ${MAX_SAVED_SEARCHES} saved searches`);
  }
  const now = serverTimestamp();
  const ref = await addDoc(savedSearchesRef(userId), {
    name: input.name.trim(),
    filters: input.filters,
    notificationFrequency: input.notificationFrequency,
    isActive: true,
    matchCount: 0,
    newMatchCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const created = await getDoc(ref);
  return toSavedSearch(created);
}

export async function updateSavedSearch(
  userId: string,
  searchId: string,
  data: Partial<Pick<SavedSearch, 'name' | 'filters' | 'notificationFrequency' | 'isActive'>>
): Promise<void> {
  await updateDoc(searchRef(userId, searchId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteSavedSearch(
  userId: string,
  searchId: string
): Promise<void> {
  await deleteDoc(searchRef(userId, searchId));
}

export async function toggleSavedSearchActive(
  userId: string,
  searchId: string,
  isActive: boolean
): Promise<void> {
  await updateDoc(searchRef(userId, searchId), {
    isActive,
    updatedAt: serverTimestamp(),
  });
}

/** Map a saved search's filters onto the browse query shape. */
export function filtersToPropertyFilter(
  filters: SavedSearchFilters
): PropertyFilter {
  const result: PropertyFilter = {
    sortBy: filters.sortBy ?? 'newest',
  };
  if (filters.listingType) result.listingType = filters.listingType;
  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    result.propertyType = filters.propertyTypes;
  }
  if (filters.minPrice !== undefined) result.minPrice = filters.minPrice;
  if (filters.maxPrice !== undefined) result.maxPrice = filters.maxPrice;
  if (filters.minBedrooms !== undefined) result.minBedrooms = filters.minBedrooms;
  if (filters.maxBedrooms !== undefined) result.maxBedrooms = filters.maxBedrooms;
  if (filters.minBathrooms !== undefined) result.minBathrooms = filters.minBathrooms;
  if (filters.maxBathrooms !== undefined) result.maxBathrooms = filters.maxBathrooms;
  if (filters.city) result.city = filters.city;
  if (filters.state) result.state = filters.state;
  if (filters.features && filters.features.length > 0) result.features = filters.features;
  if (filters.minArea !== undefined) result.minArea = filters.minArea;
  if (filters.maxArea !== undefined) result.maxArea = filters.maxArea;
  return result;
}

/** Convert a live browse filter into the persisted saved-search shape. */
export function propertyFilterToSavedSearchFilters(
  filter: PropertyFilter
): SavedSearchFilters {
  const out: SavedSearchFilters = {
    sortBy: filter.sortBy ?? 'newest',
  };
  if (filter.listingType) out.listingType = filter.listingType;
  if (filter.propertyType && filter.propertyType.length > 0) {
    out.propertyTypes = [...filter.propertyType];
  }
  if (filter.minPrice !== undefined) out.minPrice = filter.minPrice;
  if (filter.maxPrice !== undefined) out.maxPrice = filter.maxPrice;
  if (filter.minBedrooms !== undefined) out.minBedrooms = filter.minBedrooms;
  if (filter.maxBedrooms !== undefined) out.maxBedrooms = filter.maxBedrooms;
  if (filter.minBathrooms !== undefined) out.minBathrooms = filter.minBathrooms;
  if (filter.maxBathrooms !== undefined) out.maxBathrooms = filter.maxBathrooms;
  if (filter.city) out.city = filter.city;
  if (filter.state) out.state = filter.state;
  if (filter.features && filter.features.length > 0) out.features = [...filter.features];
  return out;
}

/** Short human-readable summary of the saved criteria ("2+ BR · $1M-$2M · House"). */
export function summarizeFilters(filters: SavedSearchFilters): string {
  const parts: string[] = [];
  if (filters.minBedrooms !== undefined) {
    parts.push(filters.minBedrooms === 0 ? 'Studio' : `${filters.minBedrooms}+ BR`);
  }
  if (filters.minBathrooms !== undefined && filters.minBathrooms > 0) {
    parts.push(`${filters.minBathrooms}+ BA`);
  }
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    if (filters.maxPrice === undefined) parts.push(`$${fmt(filters.minPrice ?? 0)}+`);
    else if (filters.minPrice === undefined || filters.minPrice === 0) parts.push(`Under $${fmt(filters.maxPrice)}`);
    else parts.push(`$${fmt(filters.minPrice)}-$${fmt(filters.maxPrice)}`);
  }
  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    parts.push(filters.propertyTypes.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', '));
  }
  if (filters.city) parts.push(filters.city);
  if (filters.state) parts.push(filters.state);
  if (filters.features && filters.features.length > 0) {
    parts.push(`${filters.features.length} amenit${filters.features.length === 1 ? 'y' : 'ies'}`);
  }
  if (filters.listingType) parts.push(filters.listingType === 'rent' ? 'Rent' : 'Buy');
  return parts.length > 0 ? parts.join(' · ') : 'All properties';
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Execute a saved search and record the run (updates `matchCount`, clears
 * `newMatchCount`, stamps `lastRunAt`). Returns the matching properties.
 */
export async function runSavedSearch(
  userId: string,
  search: SavedSearch
): Promise<Property[]> {
  const result = await getProperties(filtersToPropertyFilter(search.filters), 50);
  const matches = result.properties;
  await updateDoc(searchRef(userId, search.id), {
    matchCount: matches.length,
    newMatchCount: 0,
    lastRunAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return matches;
}