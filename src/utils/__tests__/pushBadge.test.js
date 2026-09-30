/**
 * Unit tests for push-badge state (mirrors src/utils/pushBadge.ts).
 *
 * Run with: node src/utils/__tests__/pushBadge.test.js
 * Mirror pattern: pure sync logic re-implemented, no expo-modules/Firebase
 * imports. Pins the legacy-format fallback and the unread-capped display
 * count (iOS renders "9+" above 9 but caps setBadge at 99).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Mirrored logic (src/utils/pushBadge.ts) ───────────────────────────────

function extractUnreadCount(data) {
  if (!data) return null;
  const raw =
    data.unreadCount ?? data.unread_count ?? data.badge ?? data.count ?? null;
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function displayCount(unreadCount) {
  if (unreadCount == null || unreadCount <= 0) return 0;
  return Math.min(unreadCount, 99);
}

// ── extractUnreadCount ────────────────────────────────────────────────────

describe('extractUnreadCount', () => {
  test('reads unreadCount from new-format payloads', () => {
    assert.equal(extractUnreadCount({ unreadCount: 3 }), 3);
  });

  test('falls back to legacy unread_count string (Cloud Functions format)', () => {
    assert.equal(extractUnreadCount({ unread_count: '5' }), 5);
  });

  test('falls back to badge and count keys', () => {
    assert.equal(extractUnreadCount({ badge: 2 }), 2);
    assert.equal(extractUnreadCount({ count: 7 }), 7);
  });

  test('returns null when absent, garbage, or negative', () => {
    assert.equal(extractUnreadCount(undefined), null);
    assert.equal(extractUnreadCount({}), null);
    assert.equal(extractUnreadCount({ unreadCount: 'abc' }), null);
    assert.equal(extractUnreadCount({ unreadCount: -1 }), null);
    assert.equal(extractUnreadCount({ unreadCount: null }), null);
  });
});

// ── displayCount ──────────────────────────────────────────────────────────

describe('displayCount', () => {
  test('passes small counts through', () => {
    assert.equal(displayCount(1), 1);
    assert.equal(displayCount(9), 9);
  });

  test('caps at 99 (iOS renders 9+ above 9, badge caps at 99)', () => {
    assert.equal(displayCount(120), 99);
    assert.equal(displayCount(0), 0);
    assert.equal(displayCount(null), 0);
  });
});
