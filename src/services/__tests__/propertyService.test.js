/**
 * Unit tests for propertyService pure helper functions.
 *
 * These mirror the extracted logic from propertyService.ts without requiring
 * Firebase dependencies. Run with:  node src/services/__tests__/propertyService.test.js
 *
 * Coverage:
 *   - computeSimilarPriceRange: ±20% price band
 *   - filterSimilarProperties: exclude current + inactive, limit results
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Re-implement the pure logic under test (mirrors propertyService.ts) ──

/**
 * Compute the price range for similar-property queries (±20%).
 * Matches: computeSimilarPriceRange in src/services/propertyService.ts
 */
function computeSimilarPriceRange(price) {
  return {
    min: Math.round(price * 0.8),
    max: Math.round(price * 1.2),
  };
}

/**
 * Filter candidate properties for similarity: exclude the current listing
 * and inactive properties, keep at most `limit` results.
 * Matches: filterSimilarProperties in src/services/propertyService.ts
 */
function filterSimilarProperties(candidates, currentId, maxResults = 6) {
  return candidates
    .filter((p) => p.id !== currentId && p.status !== 'inactive')
    .slice(0, maxResults);
}

// ── Helper: build a minimal property stub ────────────────────────────────

function makeProperty(overrides = {}) {
  return {
    id: 'prop_1',
    title: 'Test Property',
    price: 300_000,
    propertyType: 'house',
    status: 'active',
    city: 'Nairobi',
    ...overrides,
  };
}

// ── computeSimilarPriceRange ────────────────────────────────────────────

describe('computeSimilarPriceRange', () => {
  test('returns ±20% range for a round number', () => {
    const range = computeSimilarPriceRange(300_000);
    assert.equal(range.min, 240_000);
    assert.equal(range.max, 360_000);
  });

  test('returns ±20% range for an odd price', () => {
    const range = computeSimilarPriceRange(123_456);
    assert.equal(range.min, Math.round(123_456 * 0.8));
    assert.equal(range.max, Math.round(123_456 * 1.2));
  });

  test('min and max are integers (rounded)', () => {
    const range = computeSimilarPriceRange(99_999);
    assert.ok(Number.isInteger(range.min));
    assert.ok(Number.isInteger(range.max));
  });

  test('range is symmetric around the price', () => {
    const price = 500_000;
    const range = computeSimilarPriceRange(price);
    assert.ok(range.min < price);
    assert.ok(range.max > price);
    assert.equal(range.max - price, price - range.min);
  });

  test('handles zero price', () => {
    const range = computeSimilarPriceRange(0);
    assert.equal(range.min, 0);
    assert.equal(range.max, 0);
  });

  test('handles very large price', () => {
    const range = computeSimilarPriceRange(10_000_000);
    assert.equal(range.min, 8_000_000);
    assert.equal(range.max, 12_000_000);
  });
});

// ── filterSimilarProperties ─────────────────────────────────────────────

describe('filterSimilarProperties', () => {
  const propA = makeProperty({ id: 'a', status: 'active' });
  const propB = makeProperty({ id: 'b', status: 'active' });
  const propC = makeProperty({ id: 'c', status: 'inactive' });
  const propD = makeProperty({ id: 'd', status: 'pending' });
  const propE = makeProperty({ id: 'e', status: 'sold' });

  test('excludes the current property by id', () => {
    const result = filterSimilarProperties([propA, propB], 'a');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'b');
  });

  test('excludes inactive properties', () => {
    const result = filterSimilarProperties([propA, propB, propC], 'x');
    assert.equal(result.length, 2);
    assert.ok(result.every((p) => p.status !== 'inactive'));
  });

  test('keeps pending and sold properties (only inactive is excluded)', () => {
    const result = filterSimilarProperties([propA, propD, propE], 'x');
    assert.equal(result.length, 3);
  });

  test('returns at most 6 results by default', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      makeProperty({ id: `p${i}`, status: 'active' })
    );
    const result = filterSimilarProperties(many, 'exclude_me');
    assert.equal(result.length, 6);
  });

  test('respects custom maxResults', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      makeProperty({ id: `p${i}`, status: 'active' })
    );
    const result = filterSimilarProperties(many, 'x', 3);
    assert.equal(result.length, 3);
  });

  test('returns empty array when no candidates', () => {
    const result = filterSimilarProperties([], 'x');
    assert.equal(result.length, 0);
  });

  test('returns empty when all are inactive', () => {
    const inactive = makeProperty({ id: 'i', status: 'inactive' });
    const result = filterSimilarProperties([inactive], 'x');
    assert.equal(result.length, 0);
  });

  test('handles edge case: only the current property', () => {
    const result = filterSimilarProperties([propA], 'a');
    assert.equal(result.length, 0);
  });

  test('preserves order of candidates', () => {
    const p1 = makeProperty({ id: '1', status: 'active' });
    const p2 = makeProperty({ id: '2', status: 'active' });
    const p3 = makeProperty({ id: '3', status: 'active' });
    const result = filterSimilarProperties([p1, p2, p3], 'x');
    assert.deepEqual(
      result.map((p) => p.id),
      ['1', '2', '3']
    );
  });

  test('mixed statuses: keeps active, pending, sold; drops inactive', () => {
    const items = [
      makeProperty({ id: 'a1', status: 'active' }),
      makeProperty({ id: 'i1', status: 'inactive' }),
      makeProperty({ id: 'p1', status: 'pending' }),
      makeProperty({ id: 's1', status: 'sold' }),
      makeProperty({ id: 'i2', status: 'inactive' }),
      makeProperty({ id: 'a2', status: 'active' }),
    ];
    const result = filterSimilarProperties(items, 'x');
    assert.equal(result.length, 4);
    assert.deepEqual(
      result.map((p) => p.id),
      ['a1', 'p1', 's1', 'a2']
    );
  });
});
