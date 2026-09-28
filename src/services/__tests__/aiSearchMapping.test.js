/**
 * Unit tests for the AI search mapping helpers.
 *
 * Mirrors src/services/aiSearchMapping.ts (no TS loader in the Node runner —
 * same convention as cloudinaryUpload.test.js). Locks the contract between
 * the parseSearchQuery callable's filter shape and the app's PropertyFilter
 * plus the human-readable chip rendering.
 *
 * Run with: node src/services/__tests__/aiSearchMapping.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Mirrored constants (keep in sync with src/config/theme.ts) ─────────────

const PROPERTY_TYPES = [
  { key: 'house', label: 'House' },
  { key: 'apartment', label: 'Apartment' },
  { key: 'condo', label: 'Condo' },
  { key: 'townhouse', label: 'Townhouse' },
  { key: 'bedsitter', label: 'Bedsitter' },
  { key: 'maisonette', label: 'Maisonette' },
  { key: 'land', label: 'Land' },
  { key: 'commercial', label: 'Commercial' },
];

const PROPERTY_FEATURES = [
  { key: 'parking', label: 'Parking' },
  { key: 'garage', label: 'Garage' },
  { key: 'pool', label: 'Swimming Pool' },
  { key: 'gym', label: 'Gym' },
  { key: 'garden', label: 'Garden' },
];

// ── Mirrors of aiSearchMapping.ts ──────────────────────────────────────────

const SORT_KEYS = ['price_asc', 'price_desc', 'newest', 'oldest', 'popular'];

function parsedToPropertyFilter(parsed) {
  const filter = {};
  if (parsed.sortBy && SORT_KEYS.includes(parsed.sortBy)) filter.sortBy = parsed.sortBy;
  if (parsed.listingType) filter.listingType = parsed.listingType;
  if (parsed.propertyType && parsed.propertyType.length > 0) filter.propertyType = parsed.propertyType;
  if (parsed.minPrice !== undefined) filter.minPrice = parsed.minPrice;
  if (parsed.maxPrice !== undefined) filter.maxPrice = parsed.maxPrice;
  if (parsed.minBedrooms !== undefined) filter.minBedrooms = parsed.minBedrooms;
  if (parsed.minBathrooms !== undefined) filter.minBathrooms = parsed.minBathrooms;
  if (parsed.city) filter.city = parsed.city;
  if (parsed.features && parsed.features.length > 0) filter.features = parsed.features;
  return filter;
}

const KNOWN_TYPE_KEYS = new Set(PROPERTY_TYPES.map((t) => t.key));
const KNOWN_FEATURE_KEYS = new Set(PROPERTY_FEATURES.map((f) => f.key));

function featureLabel(key) {
  const hit = PROPERTY_FEATURES.find((f) => f.key === key);
  return hit ? hit.label : key;
}

function typeLabel(key) {
  const hit = PROPERTY_TYPES.find((t) => t.key === key);
  return hit ? hit.label : key;
}

function money(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function filtersToChips(parsed) {
  const chips = [];
  if (parsed.listingType) {
    chips.push({ key: 'listingType', label: parsed.listingType === 'rent' ? 'For Rent' : 'For Sale' });
  }
  if (parsed.city) chips.push({ key: 'city', label: parsed.city });
  if (parsed.propertyType) {
    for (const t of parsed.propertyType) {
      if (KNOWN_TYPE_KEYS.has(t)) chips.push({ key: `type:${t}`, label: typeLabel(t) });
    }
  }
  if (parsed.minPrice !== undefined) chips.push({ key: 'minPrice', label: `from ${money(parsed.minPrice)}` });
  if (parsed.maxPrice !== undefined) chips.push({ key: 'maxPrice', label: `under ${money(parsed.maxPrice)}` });
  if (parsed.minBedrooms !== undefined) chips.push({ key: 'minBedrooms', label: `${parsed.minBedrooms}+ beds` });
  if (parsed.minBathrooms !== undefined) chips.push({ key: 'minBathrooms', label: `${parsed.minBathrooms}+ baths` });
  if (parsed.features) {
    for (const f of parsed.features) {
      if (KNOWN_FEATURE_KEYS.has(f)) chips.push({ key: `feature:${f}`, label: featureLabel(f) });
    }
  }
  if (parsed.sortBy === 'price_asc') chips.push({ key: 'sortBy', label: 'cheapest first' });
  else if (parsed.sortBy === 'price_desc') chips.push({ key: 'sortBy', label: 'priciest first' });
  else if (parsed.sortBy === 'newest') chips.push({ key: 'sortBy', label: 'newest first' });
  return chips;
}

function removeChipFromFilters(parsed, key) {
  const next = { ...parsed };
  switch (key) {
    case 'listingType': delete next.listingType; break;
    case 'city': delete next.city; break;
    case 'minPrice': delete next.minPrice; break;
    case 'maxPrice': delete next.maxPrice; break;
    case 'minBedrooms': delete next.minBedrooms; break;
    case 'minBathrooms': delete next.minBathrooms; break;
    case 'sortBy': delete next.sortBy; break;
    default:
      if (key.startsWith('type:')) {
        next.propertyType = (next.propertyType || []).filter((t) => t !== key.slice(5));
        if (next.propertyType.length === 0) delete next.propertyType;
      } else if (key.startsWith('feature:')) {
        next.features = (next.features || []).filter((f) => f !== key.slice(8));
        if (next.features.length === 0) delete next.features;
      }
      break;
  }
  return next;
}

function isFilterEmpty(filter) {
  return Object.keys(filter).length === 0;
}

// ── parsedToPropertyFilter ─────────────────────────────────────────────────

describe('parsedToPropertyFilter', () => {
  test('maps a full parsed object onto PropertyFilter', () => {
    const filter = parsedToPropertyFilter({
      listingType: 'sale',
      propertyType: ['house', 'townhouse'],
      minPrice: 100000,
      maxPrice: 400000,
      minBedrooms: 3,
      minBathrooms: 2,
      city: 'Austin',
      features: ['parking', 'pool'],
      sortBy: 'price_asc',
    });
    assert.deepEqual(filter, {
      listingType: 'sale',
      propertyType: ['house', 'townhouse'],
      minPrice: 100000,
      maxPrice: 400000,
      minBedrooms: 3,
      minBathrooms: 2,
      city: 'Austin',
      features: ['parking', 'pool'],
      sortBy: 'price_asc',
    });
  });

  test('drops unknown sortBy instead of passing it through', () => {
    const filter = parsedToPropertyFilter({ sortBy: 'weird' });
    assert.deepEqual(filter, {});
  });

  test('omits empty lists and undefined values', () => {
    const filter = parsedToPropertyFilter({
      propertyType: [],
      features: [],
      minPrice: undefined,
    });
    assert.deepEqual(filter, {});
    assert.equal(isFilterEmpty(filter), true);
  });
});

// ── filtersToChips ─────────────────────────────────────────────────────────

describe('filtersToChips', () => {
  test('renders the canonical example query as readable chips', () => {
    const chips = filtersToChips({
      listingType: 'sale',
      minBedrooms: 3,
      maxPrice: 400000,
      features: ['parking'],
      city: 'Austin',
    });
    assert.deepEqual(
      chips.map((c) => c.label),
      ['For Sale', 'Austin', 'under $400,000', '3+ beds', 'Parking']
    );
  });

  test('uses display labels for property types and features', () => {
    const chips = filtersToChips({ propertyType: ['townhouse'], features: ['pool', 'gym'] });
    assert.deepEqual(
      chips.map((c) => c.label),
      ['Townhouse', 'Swimming Pool', 'Gym']
    );
    assert.deepEqual(
      chips.map((c) => c.key),
      ['type:townhouse', 'feature:pool', 'feature:gym']
    );
  });

  test('drops unknown type/feature keys it has no label for', () => {
    const chips = filtersToChips({ propertyType: ['igloo'], features: ['rocketpad'] });
    assert.deepEqual(chips, []);
  });

  test('formats price chips with locale grouping', () => {
    const chips = filtersToChips({ minPrice: 1250000, maxPrice: 400000.4 });
    assert.deepEqual(
      chips.map((c) => c.label),
      ['from $1,250,000', 'under $400,000']
    );
  });

  test('renders sort hints', () => {
    assert.deepEqual(
      filtersToChips({ sortBy: 'price_asc' }).map((c) => c.label),
      ['cheapest first']
    );
    assert.deepEqual(
      filtersToChips({ sortBy: 'newest' }).map((c) => c.label),
      ['newest first']
    );
  });

  test('renders rent listing type', () => {
    assert.deepEqual(
      filtersToChips({ listingType: 'rent' }).map((c) => c.label),
      ['For Rent']
    );
  });
});

// ── removeChipFromFilters ──────────────────────────────────────────────────

describe('removeChipFromFilters', () => {
  test('removes scalar fields', () => {
    const next = removeChipFromFilters({ city: 'Austin', maxPrice: 400000, minBedrooms: 3 }, 'maxPrice');
    assert.deepEqual(next, { city: 'Austin', minBedrooms: 3 });
  });

  test('removes a single property type and cleans up the empty list', () => {
    const next = removeChipFromFilters({ propertyType: ['house', 'condo'] }, 'type:house');
    assert.deepEqual(next, { propertyType: ['condo'] });
    const empty = removeChipFromFilters({ propertyType: ['house'] }, 'type:house');
    assert.deepEqual(empty, {});
  });

  test('removes a single feature and cleans up the empty list', () => {
    const next = removeChipFromFilters({ features: ['pool'] }, 'feature:pool');
    assert.deepEqual(next, {});
  });

  test('does not mutate the input object', () => {
    const original = { city: 'Austin', features: ['pool'] };
    removeChipFromFilters(original, 'city');
    assert.deepEqual(original, { city: 'Austin', features: ['pool'] });
  });

  test('ignores unknown keys', () => {
    const next = removeChipFromFilters({ city: 'Austin' }, 'bogus');
    assert.deepEqual(next, { city: 'Austin' });
  });
});

// ── isFilterEmpty ──────────────────────────────────────────────────────────

describe('isFilterEmpty', () => {
  test('true for empty object, false otherwise', () => {
    assert.equal(isFilterEmpty({}), true);
    assert.equal(isFilterEmpty({ city: 'Austin' }), false);
  });
});
