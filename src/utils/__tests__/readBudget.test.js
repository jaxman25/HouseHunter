/**
 * Unit tests for the per-user Firestore read budget (mirrors
 * src/utils/firestore/readBudget.ts).
 *
 * Run with: node src/utils/__tests__/readBudget.test.js
 * Mirror pattern: the pure decision logic is re-implemented — no firebase/RN
 * imports. Covers the cap decision (window expiry, admin override, boundary),
 * the counter advance (including the operator-precedence regression where
 * consumed reads were dropped), the reset-instant math, env parsing, and the
 * error shape the UI and service catch blocks branch on.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── Mirrored logic (src/utils/firestore/readBudget.ts) ────────────────────

const DEFAULT_READ_BUDGET = 10_000;

function resolveReadBudget(raw) {
  const parsed = raw != null ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_READ_BUDGET;
}

const READ_BUDGET = resolveReadBudget(process.env.EXPO_PUBLIC_READ_BUDGET);
const READ_BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

class ReadBudgetExceededError extends Error {
  constructor(message = 'Daily read budget exceeded') {
    super(message);
    this.name = 'ReadBudgetExceededError';
    this.code = 'read-budget-exceeded';
  }
}

function checkReadBudget(state, now, override, consumed = 1) {
  const cap = override && override > 0 ? override : READ_BUDGET;
  const inWindow = (state?.readsResetAt ?? 0) > now;
  const readsToday = inWindow ? state?.readsToday ?? 0 : 0;
  return readsToday + consumed <= cap ? 'allowed' : 'exceeded';
}

function nextReadCounter(state, now, consumed = 1) {
  const resetAt = state?.readsResetAt ?? 0;
  if (resetAt > now) {
    return {
      readsToday: (state?.readsToday ?? 0) + consumed,
      readsResetAt: resetAt,
    };
  }
  return { readsToday: consumed, readsResetAt: now + READ_BUDGET_WINDOW_MS };
}

function nextResetInstant(now) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// ── env cap resolution ────────────────────────────────────────────────────

describe('resolveReadBudget (EXPO_PUBLIC_READ_BUDGET)', () => {
  test('valid values pass through', () => {
    assert.equal(resolveReadBudget('5000'), 5000);
    assert.equal(resolveReadBudget('25000'), 25000);
  });

  test('missing/invalid/negative fall back to the 10k default', () => {
    assert.equal(resolveReadBudget(undefined), DEFAULT_READ_BUDGET);
    assert.equal(resolveReadBudget(''), DEFAULT_READ_BUDGET);
    assert.equal(resolveReadBudget('abc'), DEFAULT_READ_BUDGET);
    assert.equal(resolveReadBudget('-5'), DEFAULT_READ_BUDGET);
    assert.equal(resolveReadBudget('0'), DEFAULT_READ_BUDGET);
  });
});

// ── the budget decision ───────────────────────────────────────────────────

describe('checkReadBudget', () => {
  const NOW = 1_800_000_000_000;
  const freshWindow = (readsToday) => ({
    readsToday,
    readsResetAt: NOW + 1000,
  });

  test('allows normal usage under the cap', () => {
    assert.equal(checkReadBudget(freshWindow(42), NOW, undefined), 'allowed');
  });

  test('exceeds at the 10000 default cap', () => {
    assert.equal(
      checkReadBudget(freshWindow(DEFAULT_READ_BUDGET), NOW, undefined),
      'exceeded'
    );
    assert.equal(
      checkReadBudget(freshWindow(DEFAULT_READ_BUDGET - 1), NOW, undefined),
      'allowed' // 9999 + 1 = exactly at cap
    );
  });

  test('an expired window resets the count to zero', () => {
    const stale = { readsToday: DEFAULT_READ_BUDGET, readsResetAt: NOW - 1 };
    assert.equal(checkReadBudget(stale, NOW, undefined), 'allowed');
    assert.equal(checkReadBudget(null, NOW, undefined), 'allowed');
  });

  test('an admin override raises the effective cap', () => {
    assert.equal(
      checkReadBudget(freshWindow(20_000), NOW, 50_000),
      'allowed'
    );
    assert.equal(
      checkReadBudget(freshWindow(50_000), NOW, 50_000),
      'exceeded'
    );
  });

  test('an invalid override (0/negative) falls back to the default cap', () => {
    assert.equal(checkReadBudget(freshWindow(10_000), NOW, 0), 'exceeded');
    assert.equal(checkReadBudget(freshWindow(10_000), NOW, -3), 'exceeded');
  });

  test('batch consumption is checked atomically', () => {
    assert.equal(
      checkReadBudget(freshWindow(9_998), NOW, undefined, 3),
      'exceeded' // 9998 + 3 > 10000
    );
    assert.equal(
      checkReadBudget(freshWindow(9_997), NOW, undefined, 3),
      'allowed'
    );
  });
});

// ── counter advance ───────────────────────────────────────────────────────

describe('nextReadCounter', () => {
  const NOW = 1_800_000_000_000;

  test('accumulates within a live window', () => {
    const next = nextReadCounter(
      { readsToday: 10, readsResetAt: NOW + 1000 },
      NOW,
      3
    );
    assert.deepEqual(next, { readsToday: 13, readsResetAt: NOW + 1000 });
  });

  test('regression: consumed count is never dropped by ?? precedence', () => {
    // (state?.readsToday ?? 0 + 0) used to yield 0 + 3 instead of 10 + 3.
    const next = nextReadCounter(
      { readsToday: 10, readsResetAt: NOW + 1000 },
      NOW,
      3
    );
    assert.equal(next.readsToday, 13);
  });

  test('an expired window starts fresh and rebinds the reset instant', () => {
    const next = nextReadCounter(
      { readsToday: 9_999, readsResetAt: NOW - 1 },
      NOW,
      2
    );
    assert.equal(next.readsToday, 2);
    assert.equal(next.readsResetAt, NOW + READ_BUDGET_WINDOW_MS);
  });

  test('a null state starts a fresh window', () => {
    const next = nextReadCounter(null, NOW, 1);
    assert.deepEqual(next, {
      readsToday: 1,
      readsResetAt: NOW + READ_BUDGET_WINDOW_MS,
    });
  });
});

// ── reset instant ─────────────────────────────────────────────────────────

describe('nextResetInstant', () => {
  test('aligns to local midnight (00:00 next day)', () => {
    const noon = new Date(2026, 8, 30, 12, 0, 0, 0).getTime();
    const expected = new Date(2026, 9, 1, 0, 0, 0, 0).getTime();
    assert.equal(nextResetInstant(noon), expected);
  });

  test('23:59:59.999 rolls to the next day', () => {
    const almostMidnight = new Date(2026, 8, 30, 23, 59, 59, 999).getTime();
    const expected = new Date(2026, 8, 31, 0, 0, 0, 0).getTime();
    assert.equal(nextResetInstant(almostMidnight), expected);
  });
});

// ── error surface ─────────────────────────────────────────────────────────

describe('ReadBudgetExceededError', () => {
  test('carries the name/code the UI and catch blocks branch on', () => {
    const err = new ReadBudgetExceededError();
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ReadBudgetExceededError');
    assert.equal(err.code, 'read-budget-exceeded');
    assert.equal(err.message, 'Daily read budget exceeded');
  });

  test('is distinguishable from ordinary Firestore failures', () => {
    const err = new ReadBudgetExceededError();
    assert.equal(err.code === 'failed-precondition', false);
    assert.equal(err instanceof ReadBudgetExceededError, true);
  });
});
