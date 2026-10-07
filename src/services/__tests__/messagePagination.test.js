/**
 * Unit tests for ChatScreen's message-pagination helpers
 * (src/services/messagePagination.ts — pure, Firebase-free).
 *
 * ChatScreen renders `mergeMessages(older, liveWindow)` where `older` grows
 * by 30-doc pages on scroll-up and `liveWindow` is the newest-30 onSnapshot
 * slice. These tests pin the invariants: no duplicate ids, no holes when the
 * window slides, ascending createdAt order even when pages arrive after the
 * window moved, and the page-fill hasMore rule.
 *
 * Run with: node --test src/services/__tests__/messagePagination.test.js
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { compile } = require('./run_view_test');

/** Load a pure .ts module under node --test via the babel shim. */
function loadModule(relativePath) {
  const filePath = path.resolve(__dirname, '..', relativePath);
  const compiled = compile(filePath);
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', '__dirname', '__filename', compiled)(
    mod,
    mod.exports,
    require,
    path.dirname(filePath),
    filePath
  );
  return mod.exports;
}

const {
  droppedFromWindow,
  appendOlder,
  mergeMessages,
  pageHasMore,
} = loadModule('messagePagination.ts');

const msg = (id, createdAt) => ({ id, createdAt });

describe('droppedFromWindow', () => {
  test('returns messages that slid out of the live window', () => {
    const prev = [msg('m1', '2026-10-01T00:00:01Z'), msg('m2', '2026-10-01T00:00:02Z'), msg('m3', '2026-10-01T00:00:03Z')];
    const next = [msg('m3', '2026-10-01T00:00:03Z'), msg('m4', '2026-10-01T00:00:04Z')];
    assert.deepEqual(droppedFromWindow(prev, next), [msg('m1', '2026-10-01T00:00:01Z'), msg('m2', '2026-10-01T00:00:02Z')]);
  });

  test('returns [] when the window did not move', () => {
    const w = [msg('a', '2026-10-01T00:00:01Z')];
    assert.deepEqual(droppedFromWindow(w, w), []);
  });

  test('returns [] when prev was empty (first snapshot)', () => {
    assert.deepEqual(droppedFromWindow([], [msg('x', '2026-10-01T00:00:01Z')]), []);
  });
});

describe('appendOlder', () => {
  test('appends new ids in order', () => {
    const older = [msg('m3', 't3')];
    const page = [msg('m1', 't1'), msg('m2', 't2')];
    assert.deepEqual(
      appendOlder(older, page).map((m) => m.id),
      ['m3', 'm1', 'm2']
    );
  });

  test('dedupes ids already present (page overlapping the window)', () => {
    const older = [msg('m1', 't1')];
    const page = [msg('m1', 't1'), msg('m2', 't2')];
    assert.deepEqual(
      appendOlder(older, page).map((m) => m.id),
      ['m1', 'm2']
    );
  });

  test('a page fully inside the window adds nothing', () => {
    const older = [];
    const page = [msg('w1', 't1'), msg('w2', 't2')];
    assert.equal(appendOlder(older, page).length, 2);
    // Same page again → still no duplicates.
    assert.equal(appendOlder(older, page).length, 2);
  });
});

describe('mergeMessages', () => {
  test('dedupes across slices and orders ascending by createdAt', () => {
    const older = [msg('m1', '2026-10-01T00:00:01Z'), msg('m2', '2026-10-01T00:00:02Z')];
    const window = [msg('m3', '2026-10-01T00:00:03Z'), msg('m4', '2026-10-01T00:00:04Z')];
    assert.deepEqual(
      mergeMessages(older, window).map((m) => m.id),
      ['m1', 'm2', 'm3', 'm4']
    );
  });

  test('keeps order when a page arrives AFTER the window slid (out-of-order parts)', () => {
    // Window slid up: it now holds the newest messages while an older page
    // lands afterwards — arrival order is [window, olderPage].
    const window = [msg('m71', '2026-10-01T00:01:11Z'), msg('m72', '2026-10-01T00:01:12Z')];
    const olderPage = [msg('m50', '2026-10-01T00:00:50Z'), msg('m60', '2026-10-01T00:01:00Z')];
    assert.deepEqual(
      mergeMessages(olderPage, window).map((m) => m.id),
      ['m50', 'm60', 'm71', 'm72']
    );
  });

  test('overlapping ids appear once (older copy wins)', () => {
    const a = [msg('m1', 't1'), msg('m2', 't2')];
    const b = [msg('m2', 't2'), msg('m3', 't3')];
    const merged = mergeMessages(a, b);
    assert.deepEqual(merged.map((m) => m.id), ['m1', 'm2', 'm3']);
    assert.equal(merged.filter((m) => m.id === 'm2').length, 1);
  });

  test('absorbed dropped-window messages fill the gap between older and window', () => {
    // older has m1..m40; the window slid from [m41..m70] to [m71..m100] and
    // dropped m41..m70 were absorbed into older. Timestamps are strictly
    // increasing so the merged order must follow them exactly.
    const older = [
      msg('m40', '2026-10-01T00:00:40Z'),
      msg('m41', '2026-10-01T00:01:00Z'),
      msg('m70', '2026-10-01T00:30:00Z'),
    ];
    const window = [msg('m71', '2026-10-01T00:30:01Z'), msg('m100', '2026-10-01T01:40:00Z')];
    const merged = mergeMessages(older, window);
    assert.deepEqual(merged.map((m) => m.id), ['m40', 'm41', 'm70', 'm71', 'm100']);
  });

  test('handles empty slices', () => {
    assert.deepEqual(mergeMessages([], []), []);
    assert.deepEqual(mergeMessages([], [msg('only', 't')]).map((m) => m.id), ['only']);
  });
});

describe('pageHasMore', () => {
  test('a full page may have more history', () => {
    assert.equal(pageHasMore(30, 30), true);
  });

  test('a short page ends pagination', () => {
    assert.equal(pageHasMore(12, 30), false);
    assert.equal(pageHasMore(0, 30), false);
  });
});
