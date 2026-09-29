/**
 * Unit tests for the "Recently Sold Nearby" helpers.
 *
 * Mirrors distanceKm + filterRecentlySoldNearby from
 * src/services/propertyService.ts (no TS loader in the Node runner —
 * same convention as the other suites here).
 *
 * Run with: node src/services/__tests__/recentlySoldNearby.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Mirror the pure logic under test ─────────────────────────────────────

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function filterRecentlySoldNearby(candidates, current, maxResults = 3, radiusKm = 1) {
  if (!current.latitude || !current.longitude) return [];
  return candidates
    .filter(
      (p) =>
        p.id !== current.id &&
        (p.status === 'sold' || p.status === 'rented') &&
        p.latitude != null &&
        p.longitude != null &&
        distanceKm(current.latitude, current.longitude, p.latitude, p.longitude) <= radiusKm
    )
    .sort(
      (a, b) =>
        (b.soldDate ?? b.updatedAt ?? '').localeCompare(a.soldDate ?? a.updatedAt ?? '')
    )
    .slice(0, maxResults);
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const current = { id: 'me', status: 'active', latitude: -1.286389, longitude: 36.817223 };

const nearbySold = { id: 'a', status: 'sold', latitude: -1.287, longitude: 36.818, soldDate: '2026-09-20' };
const nearbyRented = { id: 'b', status: 'rented', latitude: -1.29, longitude: 36.815, soldDate: '2026-09-25' };
const farSold = { id: 'c', status: 'sold', latitude: -1.35, longitude: 36.9, soldDate: '2026-09-26' };
const stillActive = { id: 'd', status: 'active', latitude: -1.287, longitude: 36.818 };
const isSelf = { id: 'me', status: 'sold', latitude: -1.286389, longitude: 36.817223 };

// ── Tests ─────────────────────────────────────────────────────────────────

describe('distanceKm', () => {
  test('zero distance for identical points', () => {
    assert.equal(distanceKm(-1.28, 36.81, -1.28, 36.81), 0);
  });

  test('Nairobi CBD → Westlands is roughly 3-5 km', () => {
    const d = distanceKm(-1.286389, 36.817223, -1.2673, 36.8069);
    assert.ok(d > 2 && d < 6, `got ${d}`);
  });
});

describe('filterRecentlySoldNearby', () => {
  test('keeps sold/rented within radius, excludes self and active', () => {
    const out = filterRecentlySoldNearby(
      [nearbySold, nearbyRented, farSold, stillActive, isSelf],
      current
    );
    assert.deepEqual(out.map((p) => p.id), ['b', 'a']);
  });

  test('sorts by soldDate descending', () => {
    const out = filterRecentlySoldNearby([nearbySold, nearbyRented], current);
    assert.equal(out[0].id, 'b'); // 2026-09-25
    assert.equal(out[1].id, 'a'); // 2026-09-20
  });

  test('caps at maxResults', () => {
    const many = [1, 2, 3, 4].map((i) => ({
      id: `x${i}`,
      status: 'sold',
      latitude: -1.287,
      longitude: 36.818,
      soldDate: `2026-09-0${i}`,
    }));
    assert.equal(filterRecentlySoldNearby(many, current, 3).length, 3);
  });

  test('returns empty when the current property has no coordinates', () => {
    const out = filterRecentlySoldNearby([nearbySold], { ...current, latitude: 0, longitude: 0 });
    assert.deepEqual(out, []);
  });

  test('excludes listings beyond the 1km radius', () => {
    const out = filterRecentlySoldNearby([farSold], current);
    assert.deepEqual(out, []);
  });
});
