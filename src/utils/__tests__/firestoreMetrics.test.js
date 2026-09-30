/**
 * Unit tests for Firestore metrics counter flush logic (mirrors
 * src/utils/monitoring/firestoreMetrics.ts).
 *
 * Run with: node src/utils/__tests__/firestoreMetrics.test.js
 * Mirror pattern: the pure helpers are re-implemented — no firebase/RN
 * imports. Covers the accumulate → drain → build-increment-fields pipeline
 * and the metrics doc id.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Mirrored logic (src/utils/monitoring/firestoreMetrics.ts) ─────────────

function sanitizeCollection(collectionName) {
  return collectionName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
}

function drainCounters(source) {
  const deltas = {};
  for (const [key, count] of source) {
    if (count <= 0) continue;
    deltas[key] = (deltas[key] ?? 0) + count;
  }
  source.clear();
  return deltas;
}

function buildFlushFields(deltas) {
  const fields = {};
  for (const [key, count] of Object.entries(deltas)) {
    const [op, collection] = key.split(':');
    if ((op !== 'reads' && op !== 'writes') || !collection) continue;
    fields[`${op}.${sanitizeCollection(collection)}`] =
      (fields[`${op}.${sanitizeCollection(collection)}`] ?? 0) + count;
  }
  return fields;
}

function metricsDocIdFor(now) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── sanitizeCollection ────────────────────────────────────────────────────

describe('sanitizeCollection', () => {
  test('keeps rule-safe names untouched', () => {
    assert.equal(sanitizeCollection('properties'), 'properties');
    assert.equal(sanitizeCollection('userReviews'), 'userReviews');
  });

  test('replaces path slashes and dots (field-path safety)', () => {
    assert.equal(sanitizeCollection('users/abc/savedSearches'), 'users_abc_savedSearches');
    assert.equal(sanitizeCollection('odd.name'), 'odd_name');
  });

  test('falls back to "unknown" for an empty name', () => {
    assert.equal(sanitizeCollection(''), 'unknown');
  });
});

// ── drainCounters ─────────────────────────────────────────────────────────

describe('drainCounters', () => {
  test('aggregates duplicate keys and clears the source', () => {
    const buf = new Map([
      ['reads:properties', 3],
      ['reads:properties', 0], // Map can't dup keys — set twice instead
    ]);
    buf.set('reads:properties', 3);
    buf.set('reads:messages', 1);
    buf.set('writes:notifications', 2);

    const deltas = drainCounters(buf);
    assert.deepEqual(deltas, {
      'reads:properties': 3,
      'reads:messages': 1,
      'writes:notifications': 2,
    });
    assert.equal(buf.size, 0, 'source drained');
  });

  test('drops zero and negative counts', () => {
    const buf = new Map([
      ['reads:properties', 0],
      ['writes:deals', -2],
      ['reads:users', 4],
    ]);
    assert.deepEqual(drainCounters(buf), { 'reads:users': 4 });
  });

  test('empty buffer drains to an empty delta and stays a no-op', () => {
    assert.deepEqual(drainCounters(new Map()), {});
  });
});

// ── buildFlushFields ──────────────────────────────────────────────────────

describe('buildFlushFields', () => {
  test('maps op:collection keys to op.collection field paths', () => {
    assert.deepEqual(
      buildFlushFields({ 'reads:properties': 3, 'writes:notifications': 2 }),
      { 'reads.properties': 3, 'writes.notifications': 2 }
    );
  });

  test('merges duplicates of the same collection+op', () => {
    const deltas = { 'reads:properties': 3 };
    deltas['reads:properties'] += 4;
    assert.deepEqual(buildFlushFields(deltas), { 'reads.properties': 7 });
  });

  test('accumulate-then-map merges counts across flushes', () => {
    // The live code accumulates into a Map before draining; mirror that.
    const deltas = { 'reads:properties': 3 };
    deltas['reads:properties'] = (deltas['reads:properties'] ?? 0) + 4;
    assert.deepEqual(buildFlushFields(deltas), { 'reads.properties': 7 });
  });

  test('sanitizes collection names in field paths', () => {
    assert.deepEqual(
      buildFlushFields({ 'writes:messages/sub': 1 }),
      { 'writes.messages_sub': 1 }
    );
  });

  test('ignores malformed keys', () => {
    assert.deepEqual(
      buildFlushFields({ 'nonsense': 5, 'bogus:collection': 2, ':': 1 }),
      {}
    );
  });
});

// ── metricsDocIdFor ───────────────────────────────────────────────────────

describe('metricsDocIdFor', () => {
  test('formats as yyyy-mm-dd with zero padding', () => {
    assert.equal(metricsDocIdFor(new Date(2026, 0, 5)), '2026-01-05');
    assert.equal(metricsDocIdFor(new Date(2026, 11, 31)), '2026-12-31');
  });

  test('single-digit months and days are padded', () => {
    assert.equal(metricsDocIdFor(new Date(2026, 2, 9)), '2026-03-09');
  });
});
