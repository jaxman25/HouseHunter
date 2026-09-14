/**
 * Client-side security event logging.
 *
 * Sends security-relevant events to the server-side `logSecurityEvent`
 * Cloud Function for monitoring, anomaly detection, and alerting.
 *
 * All calls are fire-and-forget: logging failures never block the user's
 * flow or expose errors to the UI.
 *
 * Events logged:
 *   - auth.login.success / auth.login.failed
 *   - auth.register
 *   - auth.password_reset
 *   - auth.email_verify
 *   - auth.session_revoked
 *   - api.callable_error
 *   - api.rate_limit_hit
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

type SecurityEventType =
  | 'auth.login.success'
  | 'auth.login.failed'
  | 'auth.register'
  | 'auth.password_reset'
  | 'auth.email_verify'
  | 'auth.session_revoked'
  | 'api.callable_error'
  | 'api.rate_limit_hit';

interface SecurityEventPayload {
  type: SecurityEventType;
  uid?: string;
  detail?: Record<string, unknown>;
}

/**
 * Log a security event to the server.
 * Best-effort: never throws, never blocks the caller.
 */
export async function logSecurityEvent(
  event: SecurityEventPayload
): Promise<void> {
  try {
    const callable = httpsCallable(getFunctionsInstance(), 'logSecurityEvent');
    await callable(event);
  } catch {
    // Security logging is best-effort — swallow all errors.
  }
}

// ─── Convenience helpers ──────────────────────────────────────────────

export async function logLoginSuccess(uid: string): Promise<void> {
  await logSecurityEvent({ type: 'auth.login.success', uid });
}

export async function logLoginFailure(
  email: string,
  errorCode: string
): Promise<void> {
  // Hash the email for privacy-safe logging.
  const emailHash = await simpleHash(email);
  await logSecurityEvent({
    type: 'auth.login.failed',
    detail: { emailHash, errorCode },
  });
}

export async function logRegistration(uid: string): Promise<void> {
  await logSecurityEvent({ type: 'auth.register', uid });
}

export async function logPasswordReset(email: string): Promise<void> {
  const emailHash = await simpleHash(email);
  await logSecurityEvent({
    type: 'auth.password_reset',
    detail: { emailHash },
  });
}

export async function logEmailVerified(uid: string): Promise<void> {
  await logSecurityEvent({ type: 'auth.email_verify', uid });
}

export async function logSessionRevoked(uid: string): Promise<void> {
  await logSecurityEvent({ type: 'auth.session_revoked', uid });
}

export async function logApiError(
  functionName: string,
  errorCode: string
): Promise<void> {
  await logSecurityEvent({
    type: 'api.callable_error',
    detail: { functionName, errorCode },
  });
}

export async function logRateLimitHit(
  functionName: string
): Promise<void> {
  await logSecurityEvent({
    type: 'api.rate_limit_hit',
    detail: { functionName },
  });
}

// ─── Simple hash (Web Crypto API) ────────────────────────────────────

async function simpleHash(value: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(value.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
  // Fallback for environments without SubtleCrypto (React Native).
  // Use a simple hash that's good enough for logging (not cryptographic).
  let hash = 0;
  const str = value.toLowerCase().trim();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
