/**
 * Session security client service.
 *
 * Wraps the Cloud Functions for:
 *   - Token revocation on password change
 *   - Failed/successful login audit logging
 *   - Session validity checking
 *
 * All calls are best-effort: a failure in audit logging should never block
 * the user's flow. Token revocation failures are logged but thrown (the
 * caller should handle them).
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../config/firebase';

let functionsInstance: ReturnType<typeof getFunctions> | null = null;

function getFunctionsInstance() {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app);
  }
  return functionsInstance;
}

// ─── Token Revocation ─────────────────────────────────────────────────

/**
 * Revoke all refresh tokens for the current user.
 *
 * Called after password change to force logout on all other devices.
 * The current device continues working because the new credential is
 * already active.
 */
export async function revokeAllTokens(): Promise<void> {
  const callable = httpsCallable(getFunctionsInstance(), 'revokeRefreshTokens');
  await callable();
}

// ─── Audit Logging ────────────────────────────────────────────────────

/**
 * Log a failed login attempt to the server-side audit trail.
 * Best-effort: never throws, never blocks the user.
 */
export async function logFailedLogin(email: string): Promise<void> {
  try {
    const callable = httpsCallable(getFunctionsInstance(), 'logFailedLoginAttempt');
    await callable({ email });
  } catch {
    // Audit logging is best-effort — swallow errors.
  }
}

/**
 * Log a successful login event for anomaly detection.
 * Best-effort: never throws, never blocks the user.
 */
export async function logSuccessfulLogin(): Promise<void> {
  try {
    const callable = httpsCallable(getFunctionsInstance(), 'logSuccessfulLogin');
    await callable();
  } catch {
    // Audit logging is best-effort — swallow errors.
  }
}

// ─── Session Validation ───────────────────────────────────────────────

/**
 * Check if the current session is still valid (not revoked server-side).
 * Returns true if valid, false if the session was revoked (e.g. password
 * changed on another device).
 */
export async function checkSessionValidity(): Promise<boolean> {
  try {
    const callable = httpsCallable(getFunctionsInstance(), 'checkSessionValid');
    const result = await callable();
    const data = result.data as { valid?: boolean; reason?: string };
    return data?.valid !== false;
  } catch {
    // If we can't check, assume valid to avoid locking out users on
    // transient errors.
    return true;
  }
}
