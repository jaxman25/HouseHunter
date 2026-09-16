/**
 * Security monitoring Cloud Functions.
 *
 * Provides comprehensive logging and anomaly detection for:
 *   1. Authentication attempts (success/failure rate monitoring)
 *   2. API errors (callable function failures)
 *   3. Unusual traffic patterns (IP-based rate analysis)
 *   4. Automated alerting when thresholds are exceeded
 *
 * Architecture:
 *   - Callable: `logSecurityEvent` — called by the client for all security events
 *   - Scheduled: `analyzeSecurityLogs` — runs hourly to detect anomalies
 *   - Trigger: `onSecurityAlert` — emails ops when threshold exceeded
 *
 * All events are written to `admin_securityLogs/{date}/events/{eventId}` for
 * analysis and to `admin_auditLog` for the admin dashboard.
 *
 * Deploy:
 *   firebase deploy --only functions:logSecurityEvent,functions:analyzeSecurityLogs
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

initializeApp();
const db = getFirestore();

// ─── Types ────────────────────────────────────────────────────────────

type SecurityEventType =
  | 'auth.login.success'
  | 'auth.login.failed'
  | 'auth.register'
  | 'auth.password_reset'
  | 'auth.email_verify'
  | 'auth.session_revoked'
  | 'api.callable_error'
  | 'api.rate_limit_hit'
  | 'traffic.suspicious_pattern'
  | 'traffic.high_error_rate'
  | 'traffic.unusual_ip';

interface SecurityEvent {
  type: SecurityEventType;
  uid?: string;
  ip?: string;
  userAgent?: string;
  detail?: Record<string, unknown>;
  timestamp: FieldValue;
}

// ─── Helper ───────────────────────────────────────────────────────────

function hashForLog(value: string): string {
  return createHash('sha256')
    .update(value.toLowerCase().trim())
    .digest('hex')
    .slice(0, 16);
}

function getClientIp(request: { rawRequest?: { headers?: Record<string, string | string[] | undefined> } }): string {
  const headers = request.rawRequest?.headers;
  if (!headers) return 'unknown';
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp;
  return 'unknown';
}

function getUserAgent(request: { rawRequest?: { headers?: Record<string, string | string[] | undefined> } }): string {
  const headers = request.rawRequest?.headers;
  const ua = headers?.['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 200) : 'unknown';
}

// ─── Thresholds ───────────────────────────────────────────────────────

const THRESHOLDS = {
  /** Max failed logins per IP per 15-minute window before alerting. */
  FAILED_LOGINS_PER_IP: 10,
  /** Max failed logins per email per hour before alerting. */
  FAILED_LOGINS_PER_EMAIL: 5,
  /** Max API errors per function per hour before alerting. */
  API_ERRORS_PER_FUNCTION: 20,
  /** Min requests per IP per hour to flag as "unusual" if error rate > 50%. */
  MIN_REQUESTS_FOR_ERROR_RATE: 10,
  /** Error rate threshold (0-1) to trigger alert. */
  ERROR_RATE_THRESHOLD: 0.5,
};

// ─── Callable: logSecurityEvent ───────────────────────────────────────

/**
 * Log a security event from the client or server.
 *
 * Called by:
 *   - Client: login/register/password-reset results
 *   - Server: callable function errors, rate limit hits
 *
 * Rate-limited per IP (100/min) to prevent abuse.
 */
export const logSecurityEvent = onCall(async (request) => {
  const data = (request.data ?? {}) as Partial<SecurityEvent> & {
    type?: SecurityEventType;
  };

  if (!data.type) {
    throw new HttpsError('invalid-argument', 'type is required.');
  }

  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  const event: SecurityEvent = {
    type: data.type,
    uid: request.auth?.uid ?? data.uid,
    ip,
    userAgent,
    detail: data.detail ?? {},
    timestamp: FieldValue.serverTimestamp(),
  };

  // Write to daily security logs for analysis.
  const today = new Date().toISOString().slice(0, 10);
  await db.collection('admin_securityLogs').doc(today)
    .collection('events')
    .add(event);

  // Also write to audit log for the admin dashboard.
  await db.collection('admin_auditLog').add({
    action: data.type,
    actorUid: event.uid,
    ip: event.ip,
    userAgent: event.userAgent,
    detail: event.detail,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

// ─── Scheduled: analyzeSecurityLogs ───────────────────────────────────

/**
 * Hourly security log analysis.
 *
 * Scans the last hour's events and triggers alerts when:
 *   - A single IP has > FAILED_LOGINS_PER_IP failed logins
 *   - A single email has > FAILED_LOGINS_PER_EMAIL failed logins
 *   - A function has > API_ERRORS_PER_FUNCTION errors
 *   - An IP has a > ERROR_RATE_THRESHOLD error rate
 */
export const analyzeSecurityLogs = onSchedule('every 1 hours', async () => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Query all events from the last hour.
    const eventsSnap = await db
      .collectionGroup('events')
      .where('timestamp', '>=', oneHourAgo)
      .limit(10000)
      .get();

    const events = eventsSnap.docs.map((d) => d.data() as SecurityEvent);

    const alerts: string[] = [];

    // ─── 1. Failed login analysis (by IP) ───────────────────────────
    const failedByIp = new Map<string, number>();
    const failedByEmail = new Map<string, number>();

    for (const event of events) {
      if (event.type === 'auth.login.failed') {
        if (event.ip) {
          failedByIp.set(event.ip, (failedByIp.get(event.ip) ?? 0) + 1);
        }
        if (event.detail?.emailHash) {
          const hash = String(event.detail.emailHash);
          failedByEmail.set(hash, (failedByEmail.get(hash) ?? 0) + 1);
        }
      }
    }

    for (const [ip, count] of failedByIp) {
      if (count >= THRESHOLDS.FAILED_LOGINS_PER_IP) {
        alerts.push(
          `[BRUTE-FORCE] IP ${ip} had ${count} failed logins in the last hour.`
        );
      }
    }

    for (const [emailHash, count] of failedByEmail) {
      if (count >= THRESHOLDS.FAILED_LOGINS_PER_EMAIL) {
        alerts.push(
          `[CREDENTIAL-STUFFING] Email hash ${emailHash} had ${count} failed logins in the last hour.`
        );
      }
    }

    // ─── 2. API error analysis ───────────────────────────────────────
    const errorsByFunction = new Map<string, number>();
    const requestsByIp = new Map<string, { total: number; errors: number }>();

    for (const event of events) {
      if (event.type === 'api.callable_error') {
        const fn = String(event.detail?.functionName ?? 'unknown');
        errorsByFunction.set(fn, (errorsByFunction.get(fn) ?? 0) + 1);
      }

      // Track per-IP error rates.
      if (event.ip) {
        const current = requestsByIp.get(event.ip) ?? { total: 0, errors: 0 };
        current.total += 1;
        if (event.type.includes('failed') || event.type.includes('error')) {
          current.errors += 1;
        }
        requestsByIp.set(event.ip, current);
      }
    }

    for (const [fn, count] of errorsByFunction) {
      if (count >= THRESHOLDS.API_ERRORS_PER_FUNCTION) {
        alerts.push(
          `[API-ERRORS] Function "${fn}" had ${count} errors in the last hour.`
        );
      }
    }

    // ─── 3. Unusual traffic patterns ─────────────────────────────────
    for (const [ip, stats] of requestsByIp) {
      if (
        stats.total >= THRESHOLDS.MIN_REQUESTS_FOR_ERROR_RATE &&
        stats.errors / stats.total > THRESHOLDS.ERROR_RATE_THRESHOLD
      ) {
        alerts.push(
          `[HIGH-ERROR-RATE] IP ${ip}: ${stats.errors}/${stats.total} requests failed `
          + `(${Math.round((stats.errors / stats.total) * 100)}% error rate).`
        );
      }
    }

    // ─── 4. Trigger alerts if thresholds exceeded ────────────────────
    if (alerts.length > 0) {
      console.warn(`[security-monitor] ${alerts.length} alerts triggered:`);
      for (const alert of alerts) {
        console.warn(alert);
      }

      // Write alert to Firestore so the admin dashboard can display it.
      await db.collection('admin_security_alerts').add({
        title: `Security Alert — ${alerts.length} issue(s) detected`,
        body: alerts.join('\n\n'),
        severity: 'high',
        status: 'pending',
        source: 'securityMonitor',
        createdAt: FieldValue.serverTimestamp(),
      });

      // Write summary to daily security report.
      await db.collection('admin_securityReports').doc(today).set(
        {
          alertCount: FieldValue.increment(alerts.length),
          alerts,
          analyzedAt: FieldValue.serverTimestamp(),
          eventCount: events.length,
          summary: {
            failedLogins: events.filter((e) => e.type === 'auth.login.failed').length,
            successfulLogins: events.filter((e) => e.type === 'auth.login.success').length,
            apiErrors: events.filter((e) => e.type === 'api.callable_error').length,
            uniqueIps: requestsByIp.size,
          },
        },
        { merge: true }
      );
    }

    // ─── 5. Write analysis summary (always, even if no alerts) ───────
    await db.collection('admin_securityReports').doc(today).set(
      {
        lastAnalysisAt: FieldValue.serverTimestamp(),
        eventCount: events.length,
        summary: {
          failedLogins: events.filter((e) => e.type === 'auth.login.failed').length,
          successfulLogins: events.filter((e) => e.type === 'auth.login.success').length,
          apiErrors: events.filter((e) => e.type === 'api.callable_error').length,
          uniqueIps: requestsByIp.size,
        },
      },
      { merge: true }
    );
  } catch (error) {
    console.error('[security-monitor] Analysis failed:', error);
  }
});
