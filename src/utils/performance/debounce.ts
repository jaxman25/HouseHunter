/* eslint-disable react-hooks/refs -- this hook's API is a stable wrapper
   around a ref-held debounced function; returning ref.current is the point. */

/**
 * Debounce utilities.
 *
 * Debouncing coalesces a burst of calls (e.g. keystrokes, filter changes)
 * into a single invocation that runs `wait` ms after the last call.
 *
 * Use `debounce` for one-off callbacks or `useDebouncedCallback` inside
 * components — the hook keeps the latest callback via a ref and returns a
 * stable debounced function that survives re-renders.
 */

import { useEffect, useRef } from 'react';

export interface DebouncedFunction<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  /** Cancel any pending invocation. */
  cancel: () => void;
}

/**
 * Create a debounced version of `func`: calls are delayed until `wait` ms
 * pass without another call, then the trailing call is executed once.
 *
 * @param func - The function to debounce.
 * @param wait - Delay in milliseconds.
 * @returns A debounced function with a `.cancel()` method.
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = null;
      func(...args);
    }, wait);
  }) as DebouncedFunction<T>;

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}

/**
 * React hook: returns a stable, debounced wrapper around `callback`.
 * The wrapper is created once; the latest `callback` is always invoked via a
 * ref, so the debounced function can be safely passed to `onChangeText`,
 * `onEndReached`, etc. without re-creating timers every render.
 */
export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  wait: number
): DebouncedFunction<T> {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const debouncedRef = useRef<DebouncedFunction<T> | null>(null);
  if (!debouncedRef.current) {
    debouncedRef.current = debounce(
      (...args: Parameters<T>) => callbackRef.current(...args),
      wait
    );
  }

  // Cancel any pending invocation on unmount.
  useEffect(() => {
    const debounced = debouncedRef.current;
    return () => debounced?.cancel();
  }, []);

  return debouncedRef.current;
}