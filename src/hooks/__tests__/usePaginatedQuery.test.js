/**
 * Unit tests for usePaginatedQuery (mirrors src/hooks/usePaginatedQuery.ts).
 *
 * Run with: node src/hooks/__tests__/usePaginatedQuery.test.js
 * The hook itself is React state; here we test the STATE MACHINE it
 * implements — page assembly, cursor exhaustion, keyed reset, idempotent
 * loadMore, superseded generations — against a fake query builder, so the
 * service contract (items + cursor) and the hook semantics stay pinned.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Fake query builder + hook state machine ───────────────────────────────

/** Fake Firestore-y cursor: just a number with an id. */
function fakeCursor(n) {
  return { id: `doc-${n}`, n };
}

/**
 * Mirror of the hook's reduction for one page fetch. Returns the next state
 * given the current state and a resolved page — the exact logic inside
 * usePaginatedQuery's `run`.
 */
function reducePage(state, mode, page, generation, latestGeneration) {
  if (generation !== latestGeneration) return state; // superseded
  const cursor = page.cursor;
  const items =
    mode === 'reset' ? page.items : [...state.items, ...page.items];
  return {
    ...state,
    items,
    hasMore: cursor != null,
    loading: false,
    loadingMore: false,
  };
}

/** Same machinery, but orchestrating full hook lifecycles sequentially. */
function createHarness(fetchPage, { pageSize = 2, key = 'user-1' } = {}) {
  const state = {
    items: [],
    hasMore: false,
    loading: key != null,
    loadingMore: false,
    error: null,
  };
  let cursor = null;
  let busy = false;
  let generation = 0;

  async function run(mode) {
    if (busy) return;
    if (mode === 'more' && !cursor) return;
    busy = true;
    const gen = ++generation;
    if (mode === 'reset') {
      state.loading = true;
      state.error = null;
    } else {
      state.loadingMore = true;
    }
    try {
      // The hook fetches with a NULL cursor on reset, the live cursor on 'more'.
      const page = await fetchPage(mode === 'reset' ? null : cursor, pageSize);
      if (gen !== generation) return;
      const next = reducePage(state, mode, page, gen, generation);
      state.items = next.items;
      state.hasMore = next.hasMore;
      state.loading = false;
      state.loadingMore = false;
      cursor = page.cursor;
    } catch (err) {
      if (gen === generation) state.error = err;
    } finally {
      busy = false;
    }
  }

  return {
    state,
    loadMore: () => run('more'),
    refresh: () => run('reset'),
    /** Simulate a key change: clears state, refetches page one. */
    resetKey: () => {
      cursor = null;
      busy = false;
      state.items = [];
      state.hasMore = false;
      state.error = null;
      state.loading = key != null;
      return run('reset');
    },
  };
}

/** Service-style fake: 55 items in pages of `pageSize`. */
function makeFakeService(total) {
  return function fetchPage(cursor, pageSize) {
    const start = cursor ? cursor.n + 1 : 0;
    const items = [];
    for (let i = start; i < Math.min(start + pageSize, total); i++) {
      items.push({ id: `item-${i}` });
    }
    const last = start + items.length - 1;
    return Promise.resolve({
      items,
      cursor: start + items.length < total ? fakeCursor(last) : null,
    });
  };
}

// ── Page assembly ─────────────────────────────────────────────────────────

describe('page assembly', () => {
  test('first page fills items and sets hasMore', async () => {
    const fetchPage = makeFakeService(55);
    const h = createHarness(fetchPage, { pageSize: 20 });
    await h.refresh();
    assert.equal(h.state.items.length, 20);
    assert.equal(h.state.hasMore, true);
    assert.equal(h.state.loading, false);
  });

  test('pages concatenate until exhaustion, then hasMore goes false', async () => {
    const fetchPage = makeFakeService(25);
    const h = createHarness(fetchPage, { pageSize: 20 });
    await h.refresh();
    await h.loadMore();
    assert.equal(h.state.items.length, 25);
    assert.equal(h.state.hasMore, false);

    // Extra loadMore is a no-op past exhaustion.
    await h.loadMore();
    assert.equal(h.state.items.length, 25);
  });

  test('exactly one page: hasMore false immediately', async () => {
    const fetchPage = makeFakeService(5);
    const h = createHarness(fetchPage, { pageSize: 20 });
    await h.refresh();
    assert.equal(h.state.items.length, 5);
    assert.equal(h.state.hasMore, false);
  });
});

// ── Keyed reset / refresh ─────────────────────────────────────────────────

describe('reset semantics', () => {
  test('key change clears items and refetches page one for the new key', async () => {
    let currentKey = 'user-1';
    const fetchPage = (cursor, pageSize) => {
      // Tag every item with the key the page was fetched for.
      const base = makeFakeService(30)(cursor, pageSize);
      return base.then((page) => ({
        items: page.items.map((it) => ({ ...it, key: currentKey })),
        cursor: page.cursor,
      }));
    };
    const h = createHarness(fetchPage, { pageSize: 20 });
    await h.refresh();
    assert.equal(h.state.items[0].key, 'user-1');

    currentKey = 'user-2';
    await h.resetKey();
    assert.equal(h.state.items.length, 20);
    assert.equal(h.state.items[0].key, 'user-2', 'refetched for the new key');
    assert.equal(h.state.hasMore, true);
  });

  test('pull-to-refresh (refresh) restarts from page one', async () => {
    const fetchPage = makeFakeService(45);
    const h = createHarness(fetchPage, { pageSize: 20 });
    await h.refresh();
    await h.loadMore();
    assert.equal(h.state.items.length, 40);
    await h.refresh();
    assert.equal(h.state.items.length, 20, 'back to page one');
    assert.equal(h.state.hasMore, true);
  });

  test('error state clears on the next refresh', async () => {
    let shouldFail = true;
    const fetchPage = () =>
      shouldFail
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ items: [{ id: 1 }], cursor: null });
    const h = createHarness(fetchPage);
    await h.refresh();
    assert.ok(h.state.error);
    shouldFail = false;
    await h.refresh();
    assert.equal(h.state.error, null);
    assert.equal(h.state.items.length, 1);
  });
});

// ── Concurrency guards ────────────────────────────────────────────────────

describe('concurrency guards', () => {
  test('loadMore while a page is in flight does not double-fetch', async () => {
    let resolveFirst;
    let calls = 0;
    const fetchPage = (cursor, pageSize) => {
      calls++;
      if (calls === 1) {
        return new Promise((res) => {
          resolveFirst = () =>
            res({ items: Array.from({ length: 20 }, (_, i) => ({ id: i })), cursor: fakeCursor(19) });
        });
      }
      return makeFakeService(60)(cursor, pageSize);
    };
    const h = createHarness(fetchPage, { pageSize: 20 });
    const p1 = h.refresh();
    await h.loadMore(); // busy → no-op
    resolveFirst();
    await p1;
    assert.equal(calls, 1, 'in-flight guard held');
  });

  test('superseded generation does not clobber the newer page state', () => {
    const stale = { items: [{ id: 'old' }], hasMore: true };
    const page = { items: [{ id: 'new' }], cursor: null };
    const after = reducePage(stale, 'reset', page, 1, 2);
    assert.deepEqual(after, stale, 'stale generation discarded');
  });
});

// ── Service contract shape ────────────────────────────────────────────────

describe('service contract', () => {
  test('page result carries items + cursor exactly', async () => {
    const page = await makeFakeService(3)(null, 20);
    assert.deepEqual(Object.keys(page).sort(), ['cursor', 'items']);
    assert.equal(page.cursor, null);
  });
});
