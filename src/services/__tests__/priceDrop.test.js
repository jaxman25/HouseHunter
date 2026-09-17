/**
 * Unit tests for price drop detection logic.
 *
 * Covers the core decision logic used by the priceDropNotifications Cloud
 * Function and the priceHistoryTracking Cloud Function. Run with:
 *   node src/services/__tests__/priceDrop.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Re-implement the pure logic under test ───────────────────────────────

/**
 * Determines whether a property update constitutes a price drop.
 * Mirrors the logic in functions/src/priceDropNotifications.ts
 */
function isPriceDrop(oldPrice, newPrice) {
  if (oldPrice == null || newPrice == null) return false;
  if (typeof oldPrice !== 'number' || typeof newPrice !== 'number') return false;
  return newPrice < oldPrice;
}

/**
 * Calculates the discount percentage for a price drop.
 * Mirrors the notification body calculation in priceDropNotifications.ts
 */
function computeDiscountPercent(oldPrice, newPrice) {
  return Math.round(((oldPrice - newPrice) / oldPrice) * 100);
}

/**
 * Determines whether a property update constitutes a price change (any direction).
 * Mirrors the logic in functions/src/priceHistoryTracking.ts
 */
function isPriceChange(oldPrice, newPrice) {
  if (oldPrice == null || newPrice == null) return false;
  if (typeof oldPrice !== 'number' || typeof newPrice !== 'number') return false;
  return oldPrice !== newPrice;
}

// ── isPriceDrop ─────────────────────────────────────────────────────────

describe('isPriceDrop', () => {
  test('returns true when price decreases', () => {
    assert.ok(isPriceDrop(300_000, 250_000));
  });

  test('returns false when price increases', () => {
    assert.ok(!isPriceDrop(300_000, 350_000));
  });

  test('returns false when price is unchanged', () => {
    assert.ok(!isPriceDrop(300_000, 300_000));
  });

  test('returns false when old price is null', () => {
    assert.ok(!isPriceDrop(null, 250_000));
  });

  test('returns false when new price is null', () => {
    assert.ok(!isPriceDrop(300_000, null));
  });

  test('returns false when both prices are null', () => {
    assert.ok(!isPriceDrop(null, null));
  });

  test('returns false when old price is undefined', () => {
    assert.ok(!isPriceDrop(undefined, 250_000));
  });

  test('returns false when new price is undefined', () => {
    assert.ok(!isPriceDrop(300_000, undefined));
  });

  test('returns false when prices are strings (not numbers)', () => {
    assert.ok(!isPriceDrop('300000', '250000'));
  });

  test('handles zero new price (free)', () => {
    assert.ok(isPriceDrop(100, 0));
  });

  test('handles very small price drop', () => {
    assert.ok(isPriceDrop(1_000_000, 999_999));
  });
});

// ── computeDiscountPercent ──────────────────────────────────────────────

describe('computeDiscountPercent', () => {
  test('calculates 50% discount', () => {
    assert.equal(computeDiscountPercent(200, 100), 50);
  });

  test('calculates 10% discount', () => {
    assert.equal(computeDiscountPercent(300_000, 270_000), 10);
  });

  test('calculates 20% discount (±20% boundary)', () => {
    assert.equal(computeDiscountPercent(500_000, 400_000), 20);
  });

  test('rounds to nearest integer', () => {
    // 33.333...% → 33
    assert.equal(computeDiscountPercent(300, 200), 33);
  });

  test('100% discount (free)', () => {
    assert.equal(computeDiscountPercent(100, 0), 100);
  });
});

// ── isPriceChange ───────────────────────────────────────────────────────

describe('isPriceChange', () => {
  test('returns true when price increases', () => {
    assert.ok(isPriceChange(300_000, 350_000));
  });

  test('returns true when price decreases', () => {
    assert.ok(isPriceChange(300_000, 250_000));
  });

  test('returns false when price is unchanged', () => {
    assert.ok(!isPriceChange(300_000, 300_000));
  });

  test('returns false when old price is null', () => {
    assert.ok(!isPriceChange(null, 250_000));
  });

  test('returns false when new price is null', () => {
    assert.ok(!isPriceChange(300_000, null));
  });

  test('returns false for non-number types', () => {
    assert.ok(!isPriceChange('300000', '250000'));
  });
});
