/**
 * Throttle utilities.
 *
 * Throttling limits how often a function can run — at most once per `limit` ms
 * (leading edge), with a trailing call if invocations arrive during the
 * cooldown. Use it for high-frequency events like scroll handlers.
 *
 * Use `throttle` for one-off callbacks or `useThrottledCallback` inside
 * components — the hook keeps the latest callback via a ref and returns a
 * stable throttled function that survives re-renders.
 */

import { useEffect, useRef } from 'react';

export interface ThrottledFunction<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  /** Cancel a pending trailing invocation. */
  cancel: () => void;
}

/**
 * Create a throttled version of `func`: it runs at most once per `limit` ms.
 * If calls arrive during the cooldown, the last one is executed (trailing edge)
 * once the cooldown elapses.
 *
 * @param func - The function to throttle.
 * @param limit - Minimum interval between invocations, in milliseconds.
 * @returns A throttled function with a `.cancel()` method.
 */
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  limit: number
): ThrottledFunction<T> {
  let lastCall = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<T> | null = null;

  const throttled = ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = limit - (now - lastCall);

    if (remaining <= 0) {
      // Cooldown elapsed — run immediately (leading edge).
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastCall = now;
      pendingArgs = null;
      func(...args);
    } else {
      // Within cooldown — remember the latest args for a trailing call.
      pendingArgs = args;
      if (!timeout) {
        timeout = setTimeout(() => {
          timeout = null;
          lastCall = Date.now();
          if (pendingArgs) {
            const argsToRun = pendingArgs;
            pendingArgs = null;
            func(...argsToRun);
          }
        }, remaining);
      }
    }
  }) as ThrottledFunction<T>;

  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    pendingArgs = null;
  };

  return throttled;
}

/**
 * React hook: returns a stable, throttled wrapper around `callback`.
 * The wrapper is created once; the latest `callback` is always invoked via a
 * ref, so it can be safely passed to `onScroll`, `onRegionChangeComplete`,
 * etc. without re-creating timers every render.
 */
export function useThrottledCallback<T extends (...args: any[]) => void>(
  callback: T,
  limit: number
): ThrottledFunction<T> {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const throttledRef = useRef<ThrottledFunction<T> | null>(null);
  if (!throttledRef.current) {
    throttledRef.current = throttle(
      (...args: Parameters<T>) => callbackRef.current(...args),
      limit
    );
  }

  // Cancel any pending trailing invocation on unmount.
  useEffect(() => {
    const throttled = throttledRef.current;
    return () => throttled?.cancel();
  }, []);

  return throttledRef.current;
}