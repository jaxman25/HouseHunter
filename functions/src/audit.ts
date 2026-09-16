/**
 * Audit logging Cloud Functions for security monitoring.
 *
 * Provides callable functions that the client invokes to record security-
 * sensitive events on the server side. The audit log lives in Firestore
 * under `admin_auditLog` (read-only for admins, write-only for server SDK).
 *
 * Events logged:
 *   - login.failed  — rate-limited, records email hash + IP + user-agent
 *   - login.success — records uid + IP for post-login anomaly detection
 *   - password.changed — records uid for cross-device revocation tracking
 *
 * IMPORTANT: The client should call these AFTER the Firebase Auth SDK
 * operation completes. This is a secondary log — the primary enforcement
 * is Firebase Auth's built-in rate limiting + the client-side rate limiter.
 *
 * Rate limiting: each callable writes to a per-IP counter doc to prevent
 * an attacker from flooding the audit log.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { requireString, optionalString } from './validation';

initializeApp();
const db = getFirestore();

// ─── Helpers ──────────────────────────────────────────────────────────

/** Hash an email for privacy-safe logging (SHA-256, truncated). */
function hashEmail(email: string): string {
  return createHash('sha256')
    .update(email.toLowerCase().trim())
    .digest('hex')
    .slice(0, 16); // First 16 hex chars (64 bits) — enough to correlate
}

/** Extract client IP from the request context. */
function getClientIp(request: { rawRequest?: { headers?: Record<string, string | string[] | undefined> } }): string {
  const headers = request.rawRequest?.headers;
  if (!headers) return 'unknown';
  // Prefer forwarded headers (Cloud Functions behind load balancer).
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp;
  return 'unknown';
}

/** Extract user agent from the request context. */
function getUserAgent(request: { rawRequest?: { headers?: Record<string, string | string[] | undefined> } }): string {
  const headers = request.rawRequest?.headers;
  const ua = headers?.['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 200) : 'unknown'; // Truncate for storage
}

// ─── Rate limiting ────────────────────────────────────────────────────

const AUDIT_RATE_LIMIT = 30; // max writes per IP per minute
const RATE_WINDOW_MS = 60_000;

async function checkAuditRateLimit(ip: string): Promise<boolean> {
  const counterRef = db.doc(`admin_auditRateLimits/${ip.replace(/\./g, '_')}`);
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const data = snap.data();
      const count = (data?.count ?? 0) as number;
      const windowMs = (data?.windowMs ?? 0) as number;

      if (windowMs > windowStart && count >= AUDIT_RATE_LIMIT) {
        throw new Error('rate-limited');
      }

      tx.set(counterRef, {
        count: windowMs > windowStart ? count + 1 : 1,
        windowMs: windowMs > windowStart ? windowMs : now,
      });
    });
    return true; // Allowed
  } catch {
    return false; // Rate limited
  }
}

// ─── Callable functions ───────────────────────────────────────────────

/**
 * Log a failed login attempt.
 *
 * Called by the client after receiving an auth error from Firebase.
 * Rate-limited per IP to prevent audit log flooding.
 */
export const logFailedLoginAttempt = onCall(async (request) => {
  // SECURITY: Strict input validation.
  const data = (request.data ?? {}) as { email?: string };
  const email = requireString(data.email, 'email', { min: 3, max: 254, pattern: /^[a-zA-Z0-9@._+-]+$/ });

  const ip = getClientIp(request);

  // Rate limit: prevent attackers from flooding the audit log.
  if (!(await checkAuditRateLimit(ip))) {
    // Silently drop — don't reveal rate limiting to the caller.
    return { ok: true };
  }

  try {
    await db.collection('admin_auditLog').add({
      action: 'login.failed',
      emailHash: hashEmail(email),
      ip,
      userAgent: getUserAgent(request),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // Don't fail the caller — audit logging is best-effort.
    console.error('[audit] Failed to log login attempt:', error);
  }

  return { ok: true };
});

/**
 * Log a successful login event.
 *
 * Called by the client after successful authentication for anomaly
 * detection (e.g. login from new IP, unusual user-agent).
 */
export const logSuccessfulLogin = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const ip = getClientIp(request);

  if (!(await checkAuditRateLimit(ip))) {
    return { ok: true };
  }

  try {
    await db.collection('admin_auditLog').add({
      action: 'login.success',
      uid: auth.uid,
      ip,
      userAgent: getUserAgent(request),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('[audit] Failed to log successful login:', error);
  }

  return { ok: true };
});
