/**
 * Mapping helpers for AI natural-language search.
 *
 * Converts the callable's ParsedSearchFilters into the app's PropertyFilter
 * (src/types/index.ts) and renders those filters as human-readable chips for
 * the "Interpreted as: …" confirmation row on SearchScreen.
 *
 * Pure functions only — unit-tested in
 * src/services/__tests__/aiSearchMapping.test.js (mirrored logic, same
 * convention as the other Node-runner tests in this directory).
 */

import { PropertyFilter, PropertyType, ListingType } from '../types';
import { PROPERTY_FEATURES, PROPERTY_TYPES } from '../config/theme';
import { ParsedSearchFilters } from './aiAssistantService';

/** Convert the AI-parsed filters into the app-wide PropertyFilter shape. */
export function parsedToPropertyFilter(parsed: ParsedSearchFilters): PropertyFilter {
  const filter: PropertyFilter = {
    // The browse query treats "no status" as active+pending+sold+rented, so
    // nothing to set there. Sort rides along when the model suggested one.
    ...(parsed.sortBy && isSortKey(parsed.sortBy) ? { sortBy: parsed.sortBy } : {}),
    ...(parsed.listingType ? { listingType: parsed.listingType as ListingType } : {}),
    ...(parsed.propertyType && parsed.propertyType.length > 0
      ? { propertyType: parsed.propertyType as PropertyType[] }
      : {}),
    ...(parsed.minPrice !== undefined ? { minPrice: parsed.minPrice } : {}),
    ...(parsed.maxPrice !== undefined ? { maxPrice: parsed.maxPrice } : {}),
    ...(parsed.minBedrooms !== undefined ? { minBedrooms: parsed.minBedrooms } : {}),
    ...(parsed.minBathrooms !== undefined ? { minBathrooms: parsed.minBathrooms } : {}),
    ...(parsed.city ? { city: parsed.city } : {}),
    ...(parsed.features && parsed.features.length > 0 ? { features: parsed.features } : {}),
  };
  return filter;
}

function isSortKey(value: string): value is NonNullable<PropertyFilter['sortBy']> {
  return ['price_asc', 'price_desc', 'newest', 'oldest', 'popular'].includes(value);
}

export interface FilterChip {
  key: string;
  label: string;
}

/** Property type keys accepted from the parser (kept in sync with nlSearch.ts). */
const KNOWN_TYPE_KEYS = new Set(PROPERTY_TYPES.map((t) => t.key));

/** Feature keys accepted from the parser (kept in sync with nlSearch.ts). */
const KNOWN_FEATURE_KEYS = new Set(PROPERTY_FEATURES.map((f) => f.key));

function featureLabel(key: string): string {
  return PROPERTY_FEATURES.find((f) => f.key === key)?.label ?? key;
}

function typeLabel(key: string): string {
  return PROPERTY_TYPES.find((t) => t.key === key)?.label ?? key;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * Human-readable chips for the parsed filters, in display order.
 * Unknown propertyType/feature keys are dropped (server allowlists them, but
 * a stale client could receive new keys it has no labels for).
 */
export function filtersToChips(parsed: ParsedSearchFilters): FilterChip[] {
  const chips: FilterChip[] = [];

  if (parsed.listingType) {
    chips.push({
      key: 'listingType',
      label: parsed.listingType === 'rent' ? 'For Rent' : 'For Sale',
    });
  }
  if (parsed.city) {
    chips.push({ key: 'city', label: parsed.city });
  }
  if (parsed.propertyType) {
    for (const t of parsed.propertyType) {
      if (KNOWN_TYPE_KEYS.has(t)) chips.push({ key: `type:${t}`, label: typeLabel(t) });
    }
  }
  if (parsed.minPrice !== undefined) {
    chips.push({ key: 'minPrice', label: `from ${money(parsed.minPrice)}` });
  }
  if (parsed.maxPrice !== undefined) {
    chips.push({ key: 'maxPrice', label: `under ${money(parsed.maxPrice)}` });
  }
  if (parsed.minBedrooms !== undefined) {
    chips.push({ key: 'minBedrooms', label: `${parsed.minBedrooms}+ beds` });
  }
  if (parsed.minBathrooms !== undefined) {
    chips.push({ key: 'minBathrooms', label: `${parsed.minBathrooms}+ baths` });
  }
  if (parsed.features) {
    for (const f of parsed.features) {
      if (KNOWN_FEATURE_KEYS.has(f)) chips.push({ key: `feature:${f}`, label: featureLabel(f) });
    }
  }
  if (parsed.sortBy === 'price_asc') {
    chips.push({ key: 'sortBy', label: 'cheapest first' });
  } else if (parsed.sortBy === 'price_desc') {
    chips.push({ key: 'sortBy', label: 'priciest first' });
  } else if (parsed.sortBy === 'newest') {
    chips.push({ key: 'sortBy', label: 'newest first' });
  }

  return chips;
}

/**
 * Remove the chip identified by `key` from the parsed filters (the "x" on an
 * interpreted chip). Returns the same object when the key is unknown.
 */
export function removeChipFromFilters(parsed: ParsedSearchFilters, key: string): ParsedSearchFilters {
  const next = { ...parsed };
  switch (key) {
    case 'listingType':
      delete next.listingType;
      break;
    case 'city':
      delete next.city;
      break;
    case 'minPrice':
      delete next.minPrice;
      break;
    case 'maxPrice':
      delete next.maxPrice;
      break;
    case 'minBedrooms':
      delete next.minBedrooms;
      break;
    case 'minBathrooms':
      delete next.minBathrooms;
      break;
    case 'sortBy':
      delete next.sortBy;
      break;
    default:
      if (key.startsWith('type:')) {
        next.propertyType = (next.propertyType ?? []).filter((t) => t !== key.slice(5));
        if (next.propertyType.length === 0) delete next.propertyType;
      } else if (key.startsWith('feature:')) {
        next.features = (next.features ?? []).filter((f) => f !== key.slice(8));
        if (next.features.length === 0) delete next.features;
      }
      break;
  }
  return next;
}

/** True when the filter object has no keys left (nothing worth running). */
export function isFilterEmpty(filter: PropertyFilter): boolean {
  return Object.keys(filter).length === 0;
}
