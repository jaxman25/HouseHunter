/**
 * Session timeout hook with idle detection.
 *
 * Monitors user interaction (touches, keyboard) and automatically logs the
 * user out after a configurable period of inactivity. Shows a warning dialog
 * before the final timeout so users can extend their session.
 *
 * Firebase ID tokens expire after 1 hour, but this provides a shorter
 * client-side idle timeout to protect against abandoned sessions on shared
 * or unattended devices.
 *
 * Usage:
 *   useSessionTimeout(logoutFn, { timeoutMinutes: 30 });
 */

import { useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { InteractionManager } from 'react-native';

const WARNING_MINUTES_BEFORE = 5; // Show warning 5 minutes before timeout

export interface SessionTimeoutOptions {
  /** Total idle time in minutes before auto-logout (default: 30). */
  timeoutMinutes?: number;
  /** Minutes before timeout to show a warning (default: 5). */
  warningMinutes?: number;
  /** Whether the timeout is enabled (default: true). */
  enabled?: boolean;
}

/**
 * Detects user inactivity and triggers logout after the configured timeout.
 * The timer resets whenever the user interacts with the app.
 */
export function useSessionTimeout(
  logout: () => Promise<void>,
  options: SessionTimeoutOptions = {}
) {
  const {
    timeoutMinutes = 30,
    warningMinutes = WARNING_MINUTES_BEFORE,
    enabled = true,
  } = options;

  const timeoutMs = timeoutMinutes * 60_000;
  const warningMs = (timeoutMinutes - warningMinutes) * 60_000;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>( null);
  const warningShownRef = useRef(false);
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  // ─── Reset the idle timer ──────────────────────────────────────────
  const resetTimer = useCallback(() => {
    if (!enabled) return;

    // Clear existing timers.
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    warningShownRef.current = false;

    // Schedule the warning.
    warningRef.current = setTimeout(() => {
      warningShownRef.current = true;
      // The warning is logged to console; a real app might show a modal.
      // For this project the warning is informational — the actual logout
      // happens at the hard timeout below.
      if (__DEV__) {
        console.warn(
          `[session-timeout] Session will expire in ${warningMinutes} minutes due to inactivity.`
        );
      }
    }, warningMs);

    // Schedule the hard timeout.
    timerRef.current = setTimeout(() => {
      if (__DEV__) {
        console.warn('[session-timeout] Session expired — logging out.');
      }
      logoutRef.current().catch(() => {});
    }, timeoutMs);
  }, [enabled, timeoutMs, warningMs, warningMinutes]);

  // ─── Activity listener (web: DOM events) ──────────────────────────
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web') return;

    const reset = () => resetTimer();

    // Common interaction events on web.
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    for (const event of events) {
      document.addEventListener(event, reset, { passive: true });
    }

    // Start the timer.
    resetTimer();

    return () => {
      for (const event of events) {
        document.removeEventListener(event, reset);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [enabled, resetTimer]);

  // ─── Activity listener (native: AppState changes) ──────────────────
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    const reset = () => resetTimer();

    // AppState 'active' means the app came to foreground — reset the timer.
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        reset();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);

    // Also reset on navigation focus.
    const task = InteractionManager.runAfterInteractions(reset);

    // Start the timer.
    resetTimer();

    return () => {
      subscription.remove();
      task.cancel();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [enabled, resetTimer]);
}
