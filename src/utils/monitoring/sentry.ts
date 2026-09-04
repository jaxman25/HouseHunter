/**
 * Sentry error monitoring wrapper.
 *
 * Everything is guarded by `EXPO_PUBLIC_SENTRY_DSN`: without a DSN the module
 * no-ops (zero network, zero overhead), so local/dev builds stay quiet and the
 * app still works when Sentry isn't configured.
 *
 * Errors are captured from the error boundaries and network layer via
 * `captureError` / `addBreadcrumb`, giving context to every crash:
 * which screen failed, what operation was retried, etc.
 */

import * as Sentry from '@sentry/react-native';

let isInitialized = false;

/**
 * Initialize Sentry. Safe to call more than once. Must run before any
 * captures — call it at the top of `App`.
 */
export function initSentry(): void {
  if (isInitialized) return;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (__DEV__) {
      console.info('[sentry] No EXPO_PUBLIC_SENTRY_DSN set — error reporting disabled');
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.2,
    enabled: !__DEV__,
    // Include the JS stack when an error is captured outside an ErrorBoundary
    // (async handlers, unhandled rejections) so root causes are reachable.
    attachStacktrace: true,
  });
  isInitialized = true;

  if (!__DEV__) {
    console.info('[sentry] Error monitoring enabled. Configure alerts in the Sentry'
      + ' dashboard so errors page the on-call owner — see docs/BREACH_NOTIFICATION.md.');
  }
}

/** Whether Sentry is active (initialized with a DSN). */
export function isSentryEnabled(): boolean {
  return isInitialized;
}

/**
 * Report an error to Sentry (no-op unless initialized).
 *
 * @param error - The error to capture.
 * @param context - Optional extra context (tags/extra) attached to the event.
 */
export function captureError(
  error: unknown,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }
): void {
  if (!isInitialized) return;
  Sentry.captureException(error, context);
}

/**
 * Report a security-relevant event (failed reauthentication before account
 * deletion, repeated auth failures, unexpected permission denials). These
 * surface as warning-level issues in Sentry so alerting can page on them.
 */
export function captureSecurityEvent(message: string, extra?: Record<string, unknown>): void {
  if (!isInitialized) return;
  Sentry.captureMessage(message, {
    level: 'warning',
    tags: { category: 'security' },
    extra,
  });
}

/**
 * Record a breadcrumb — a small trail of events leading up to an error
 * (screen mounted, query retried, upload started, etc.).
 */
export function addBreadcrumb(breadcrumb: {
  category?: string;
  message: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, unknown>;
}): void {
  if (!isInitialized) return;
  Sentry.addBreadcrumb(breadcrumb);
}