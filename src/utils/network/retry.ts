/**
 * Retry logic with exponential backoff and jitter.
 *
 * Wraps transient failures (network blips, `unavailable`, `deadline-exceeded`,
 * Storage hiccups) with retries at 1s, 2s, 4s, 8s delays. Jitter is applied to
 * each delay to avoid a "thundering herd" of clients retrying in lockstep.
 *
 * Permanent errors (permission denied, not found, invalid arguments, index
 * errors, auth credential errors) are NOT retried — retrying them is wasteful
 * and can mask real configuration problems.
 */

import { TimeoutError } from './timeout';

export interface RetryOptions {
  /** Total number of attempts including the first (default 4 → 3 retries). */
  maxAttempts?: number;
  /** Base delay for the first retry in ms (default 1000). */
  baseDelayMs?: number;
  /** Upper bound for a single delay in ms (default 8000). */
  maxDelayMs?: number;
  /** Jitter factor 0–1; delay is scaled by (1 ± jitter) (default 0.2). */
  jitter?: number;
  /** Predicate deciding whether an error is worth retrying. */
  retryable?: (error: unknown) => boolean;
  /** Called before each retry (useful for logging/breadcrumbs). */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

/** Firebase/Auth error codes that will never succeed on retry. */
const NON_RETRYABLE_CODES = new Set([
  // Firestore / Storage
  'permission-denied',
  'unauthenticated',
  'not-found',
  'invalid-argument',
  'failed-precondition', // includes "query requires an index"
  'already-exists',
  'cancelled',
  // Auth
  'auth/invalid-credential',
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/email-already-in-use',
  'auth/invalid-email',
  'auth/weak-password',
  'auth/user-disabled',
  'auth/invalid-verification-code',
]);

/**
 * Decide whether an error is transient and worth retrying.
 * Firebase errors expose a `code`; anything not on the known non-retryable
 * list (unavailable, deadline-exceeded, resource-exhausted, aborted, network
 * failures, etc.) is treated as retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;

  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string') {
    return !NON_RETRYABLE_CODES.has(code);
  }

  // Plain errors (fetch failures, serialization issues, etc.) — retry them.
  return true;
}

/** Promise-based sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn`, retrying on transient failures with exponential backoff + jitter.
 *
 * @param fn - The operation to run; must be a function so it can be re-invoked.
 * @param options - Backoff tuning (see {@link RetryOptions}).
 * @returns The first successful result.
 * @throws The last error if all attempts fail, or the original error
 *         immediately if it is not retryable.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 4,
    baseDelayMs = 1000,
    maxDelayMs = 8000,
    jitter = 0.2,
    retryable = isRetryableError,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !retryable(error)) {
        throw error;
      }

      const base = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const variance = base * jitter;
      const delayMs = Math.max(0, base + (Math.random() * 2 - 1) * variance);
      onRetry?.(attempt, delayMs, error);
      await sleep(delayMs);
    }
  }

  throw lastError;
}