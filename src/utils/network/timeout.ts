/**
 * Timeout utilities for Firebase operations.
 *
 * Every network-bound operation (Firestore queries/writes, Storage uploads,
 * Auth calls) should be wrapped with `withTimeout` so a hung request surfaces
 * as a catchable `TimeoutError` instead of spinning forever.
 */

/** Default timeout for general Firebase operations (10s). */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Timeout for image uploads (30s) — uploads move more data, so they get more room. */
export const UPLOAD_TIMEOUT_MS = 30_000;

/** Thrown when an operation exceeds its allotted time. */
export class TimeoutError extends Error {
  constructor(message?: string) {
    super(message ?? 'Operation timed out');
    this.name = 'TimeoutError';
  }
}

/**
 * Race a promise against a timer. If the promise settles first, the timer is
 * cleared; if the timer wins, the promise is abandoned and `TimeoutError` is
 * thrown (the underlying promise is not cancelled, but its result is ignored).
 *
 * @param promise - The operation to bound.
 * @param timeoutMs - How long to wait before failing, in milliseconds.
 * @param message - Optional custom error message.
 * @returns The promise result if it settles within the timeout.
 * @throws {TimeoutError} If the operation does not settle in time.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  message?: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new TimeoutError(message ?? `Operation timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}