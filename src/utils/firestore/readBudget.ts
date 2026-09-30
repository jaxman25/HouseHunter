/**
 * Per-user Firestore read budget — stops runaway reads (bug or abuse).
 *
 * Every tracked read (src/utils/firestore/tracked.ts) calls consumeReadBudget.
 * The increment to the user's `counters/{uid}` doc (the same doc the write
 * rate limiter uses) is CACHED LOCALLY and flushed at most every 10s as one
 * merged write — one write per 10s while browsing, not one per read. The doc
 * carries:
 *
 *   counters/{uid} = {
 *     minute: number,        // write-budget bucket (existing)
 *     writes: number,        // write-budget count  (existing)
 *     readsToday: number,    // reads consumed in the current daily window
 *     readsResetAt: number   // epoch ms when readsToday resets to 0
 *   }
 *
 * The budget decision is made LOCALLY against the client's mirror of
 * readsToday; the rules enforce the cap server-side on the counter writes
 * (exact +1 within a window, never past the cap, reset only after
 * readsResetAt), so a compromised client can't write itself a higher number.
 * Until a flush lands there is a small overshoot window (≤ one flush of
 * reads); the rules-side cap is the hard bound — this is the tripwire that
 * surfaces ReadBudgetExceededError to the UI.
 *
 * Entirely a no-op unless EXPO_PUBLIC_METRICS_ENABLED=true.
 */

import { env } from '../env';
import { METRICS_ENABLED } from '../monitoring/firestoreMetrics';
import { showToast } from '../ui/toast';

/** Daily per-user read cap. Overridable via EXPO_PUBLIC_READ_BUDGET. */
export const DEFAULT_READ_BUDGET = 10_000;

export function resolveReadBudget(raw: string | undefined): number {
  const parsed = raw != null ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_READ_BUDGET;
}

export const READ_BUDGET = resolveReadBudget(env.EXPO_PUBLIC_READ_BUDGET);

/** A daily window: once `readsResetAt` passes, readsToday starts over. */
export const READ_BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Thrown by the tracked helpers when the user is over budget. */
export class ReadBudgetExceededError extends Error {
  readonly code = 'read-budget-exceeded';
  constructor(message = 'Daily read budget exceeded') {
    super(message);
    this.name = 'ReadBudgetExceededError';
  }
}

/**
 * Pure budget decision — the heart of the limiter, unit-tested directly.
 * `state` is the client mirror of the counter doc (null = no window yet).
 * The effective cap is the admin override when present, else READ_BUDGET.
 */
export function checkReadBudget(
  state: { readsToday: number; readsResetAt: number } | null,
  now: number,
  override: number | undefined,
  consumed = 1
): 'allowed' | 'exceeded' {
  const cap = override && override > 0 ? override : READ_BUDGET;
  const inWindow = (state?.readsResetAt ?? 0) > now;
  const readsToday = inWindow ? state?.readsToday ?? 0 : 0;
  return readsToday + consumed <= cap ? 'allowed' : 'exceeded';
}

/**
 * Next LOCAL mirror values after consuming `consumed` reads (pure). The
 * reset instant is REBOUND whenever the previous window has expired —
 * otherwise a stale resetAt would zero the counter mid-session.
 */
export function nextReadCounter(
  state: { readsToday: number; readsResetAt: number } | null,
  now: number,
  consumed = 1
): { readsToday: number; readsResetAt: number } {
  const resetAt = state?.readsResetAt ?? 0;
  if (resetAt > now) {
    return {
      readsToday: (state?.readsToday ?? 0) + consumed,
      readsResetAt: resetAt,
    };
  }
  return { readsToday: consumed, readsResetAt: now + READ_BUDGET_WINDOW_MS };
}

/** Tomorrow's reset instant, aligned to local midnight (pure). */
export function nextResetInstant(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// ─── Live state (module singletons) ───────────────────────────────────────

interface CounterState {
  readsToday: number;
  readsResetAt: number;
  /** Window the server counter currently counts into (0 = unknown). */
  flushWindowReset: number;
}

let counterState: CounterState | null = null;
let counterStateFetchedAt = 0;
let budgetOverride: number | undefined;
let overrideFetched = false;

/** Pending reads, flushed at most every 10s as ONE increment write. */
const READ_BUDGET_FLUSH_MS = 10_000;
let pendingReads = 0;
let pendingSince = 0;
let flushTimer: ReturnType<typeof setInterval> | null = null;

let currentUid: string | null = null;

/** Bind the budget counter to a user (call on auth state changes). */
export function setReadBudgetUser(uid: string | null): void {
  if (uid !== currentUid) {
    currentUid = uid;
    counterState = null;
    counterStateFetchedAt = 0;
    budgetOverride = undefined;
    overrideFetched = false;
    pendingReads = 0;
  }
}

/** How stale the local mirror may get before re-fetching the counter doc. */
const READ_BUDGET_FETCH_TTL_MS = 60_000;
let inflightFetch: Promise<void> | null = null;

async function ensureCounterState(): Promise<void> {
  if (!currentUid) return;
  if (
    counterStateFetchedAt > 0 &&
    Date.now() - counterStateFetchedAt < READ_BUDGET_FETCH_TTL_MS
  ) {
    return;
  }
  if (!inflightFetch) {
    inflightFetch = (async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('../../config/firebase');
        const snap = await getDoc(doc(db, 'counters', currentUid!));
        const data = snap.data() as
          | {
              readsToday?: number;
              readsResetAt?: number;
              flushWindowReset?: number;
            }
          | undefined;
        counterState = {
          readsToday: typeof data?.readsToday === 'number' ? data.readsToday : 0,
          readsResetAt:
            typeof data?.readsResetAt === 'number' ? data.readsResetAt : 0,
          flushWindowReset:
            typeof data?.flushWindowReset === 'number'
              ? data.flushWindowReset
              : 0,
        };
        counterStateFetchedAt = Date.now();
      } catch {
        // Offline / rules deny / doc absent — keep the local mirror as-is.
      } finally {
        inflightFetch = null;
      }
    })();
  }
  await inflightFetch;
}

/**
 * Resolve the effective cap for the current user. The admin override lives
 * on the user doc (`readBudgetOverride`); fetched once per session.
 */
async function resolveOverride(): Promise<number | undefined> {
  if (overrideFetched || !currentUid) return budgetOverride;
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const { db } = await import('../../config/firebase');
    const snap = await getDoc(doc(db, 'users', currentUid));
    const raw = snap.data()?.readBudgetOverride;
    if (typeof raw === 'number' && raw > 0) budgetOverride = raw;
    overrideFetched = true;
  } catch {
    overrideFetched = true; // don't retry this session
  }
  return budgetOverride;
}

/** Called by adminService after an admin edits the override on this device. */
export function invalidateReadBudgetOverride(): void {
  overrideFetched = false;
}

// ─── UI surfacing ───────────────────────────────────────────────────

/**
 * Non-blocking heads-up when the budget trips. Fired at the throw site so
 * EVERY screen gets it (services' existing catch blocks render their
 * empty/error states) — cooldown keeps a burst of blocked reads from
 * stacking toasts.
 */
const READ_BUDGET_TOAST_COOLDOWN_MS = 60_000;
let lastBudgetToastAt = 0;

function warnBudgetExceeded(): void {
  const now = Date.now();
  if (now - lastBudgetToastAt < READ_BUDGET_TOAST_COOLDOWN_MS) return;
  lastBudgetToastAt = now;
  showToast('You\'re browsing very fast — try again in a few minutes');
}

/**
 * Flush pending reads to counters/{uid} (one merged write). Within the
 * current window this INCREMENTS readsToday (merge-safe across this user's
 * devices); across a window boundary it ABSOLUTELY RESETS readsToday to the
 * pending count and rebinds readsResetAt — never incrementing a stale
 * window's total into the new day.
 */
export async function flushReadBudget(): Promise<void> {
  pendingSince = 0;
  const count = pendingReads;
  pendingReads = 0;
  if (!currentUid || count <= 0) return;
  try {
    const { doc, setDoc, increment } = await import('firebase/firestore');
    const { db } = await import('../../config/firebase');
    const now = Date.now();
    const windowReset = counterState?.flushWindowReset ?? 0;
    const sameWindow = now < windowReset;

    if (sameWindow) {
      await setDoc(
        doc(db, 'counters', currentUid),
        { readsToday: increment(count) },
        { merge: true }
      );
    } else {
      // Window expired (or first ever): reset the counter into a new window.
      const readsResetAt = nextResetInstant(now);
      await setDoc(
        doc(db, 'counters', currentUid),
        { readsToday: count, readsResetAt, flushWindowReset: readsResetAt },
        { merge: true }
      );
      if (counterState) {
        counterState.readsToday = count;
        counterState.readsResetAt = readsResetAt;
        counterState.flushWindowReset = readsResetAt;
      }
    }
  } catch {
    // Offline / cap already hit server-side — the local mirror still gates.
  }
}

function startBudgetFlusher(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    if (pendingReads > 0) void flushReadBudget();
  }, READ_BUDGET_FLUSH_MS);
}

/** Stop the flusher, pushing any final pending reads. */
export async function stopReadBudget(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushReadBudget();
}

/**
 * Spend `consumed` reads. Throws ReadBudgetExceededError when over budget.
 * Called by the tracked helpers BEFORE each read; a no-op (never throws)
 * when metrics are disabled or the user is unbound/unauthenticated.
 */
export async function consumeReadBudget(consumed = 1): Promise<void> {
  if (!METRICS_ENABLED) return;
  if (!currentUid) return;
  await ensureCounterState();
  const override = await resolveOverride();
  const now = Date.now();

  if (checkReadBudget(counterState, now, override, consumed) === 'exceeded') {
    warnBudgetExceeded();
    throw new ReadBudgetExceededError();
  }

  // Advance the local mirror + schedule the server increment.
  const next = nextReadCounter(counterState, now, consumed);
  counterState = {
    ...next,
    flushWindowReset: counterState?.flushWindowReset ?? 0,
  };
  if (pendingReads === 0) {
    pendingSince = now;
  }
  pendingReads += consumed;
  startBudgetFlusher();
  if (now - pendingSince >= READ_BUDGET_FLUSH_MS) {
    void flushReadBudget();
  }
}
