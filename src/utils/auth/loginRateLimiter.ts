/**
 * Client-side login rate limiter with exponential backoff.
 *
 * Tracks failed login attempts per email address. After N consecutive
 * failures the client enforces a cooldown delay before allowing the next
 * attempt, reducing brute-force velocity. This is a *client-side* layer;
 * Firebase also has its own server-side protections (temporary account
 * lockouts after ~10 failed attempts).
 *
 * The state is held in memory (not persisted) so a page/app reload resets
 * the counters — an acceptable trade-off since server-side lockouts are
 * the real safety net.
 */

/** Maximum consecutive failures before lockout kicks in. */
const MAX_FAILURES = 5;

/** Base delay in ms; doubles with each subsequent failure after the threshold. */
const BASE_DELAY_MS = 1_000;

/** Hard ceiling so the UI isn't frozen for an unreasonable time. */
const MAX_DELAY_MS = 60_000;

interface AttemptRecord {
  failures: number;
  /** Timestamp (ms) after which the next attempt is allowed. */
  cooldownUntil: number;
}

const attempts = new Map<string, AttemptRecord>();

/**
 * Returns the number of milliseconds the caller must wait before the next
 * login attempt for the given email. Returns 0 if no wait is needed.
 */
export function getLoginCooldownMs(email: string): number {
  const record = attempts.get(email.toLowerCase());
  if (!record) return 0;

  const now = Date.now();
  if (now >= record.cooldownUntil) return 0;

  return record.cooldownUntil - now;
}

/**
 * Record a failed login attempt. Returns the cooldown duration (ms) the
 * caller should enforce before the next try.
 */
export function recordLoginFailure(email: string): number {
  const key = email.toLowerCase();
  const record = attempts.get(key) ?? { failures: 0, cooldownUntil: 0 };

  record.failures += 1;

  // Apply exponential backoff once we've exceeded the threshold.
  if (record.failures >= MAX_FAILURES) {
    const exponent = record.failures - MAX_FAILURES; // 0-based after threshold
    const delay = Math.min(BASE_DELAY_MS * 2 ** exponent, MAX_DELAY_MS);
    // Add jitter (±20%) so multiple clients don't align.
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    record.cooldownUntil = Date.now() + Math.max(0, delay + jitter);
  }

  attempts.set(key, record);
  return Math.max(0, record.cooldownUntil - Date.now());
}

/**
 * Clear failure state for an email (called on successful login).
 */
export function clearLoginFailures(email: string): void {
  attempts.delete(email.toLowerCase());
}

/**
 * Returns the number of consecutive failures for display purposes.
 */
export function getLoginFailureCount(email: string): number {
  return attempts.get(email.toLowerCase())?.failures ?? 0;
}
