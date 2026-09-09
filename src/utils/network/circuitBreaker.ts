import { isRetryableError } from './retry';

/**
 * Circuit breaker for Firebase services.
 *
 * Protects the app (and the backend) from cascading failures: if a service
 * fails N times within a rolling window, the breaker trips to OPEN and calls
 * fail fast for a cooldown period instead of hammering a sick service. After
 * the cooldown it enters HALF-OPEN, allowing a single probe call; success
 * closes the circuit, failure re-opens it.
 *
 * Only TRANSIENT failures should count toward opening the circuit. Permanent
 * failures (permission-denied, unauthenticated, not-found, invalid-argument,
 * …) are configuration or rules problems, not "service sickness": counting
 * them would open the circuit and make every later call — including ones
 * that would otherwise succeed once the underlying issue is fixed — fail
 * fast with CircuitOpenError for the whole cooldown window. The shared
 * singletons below use {@link isRetryableError} as the classifier (transient
 * failures count, permanent ones do not); standalone instances default to
 * counting everything for backward compatibility.
 *
 * States:
 *  - CLOSED:   normal operation, calls pass through.
 *  - OPEN:     calls fail fast with `CircuitOpenError`.
 *  - HALF-OPEN: one trial call is allowed; outcome decides the next state.
 */

export interface CircuitBreakerOptions {
  /** Number of failures within the window that trip the breaker (default 5). */
  failureThreshold?: number;
  /** Rolling window over which failures are counted, in ms (default 30s). */
  windowMs?: number;
  /** Cooldown before trying a probe call, in ms (default 30s). */
  halfOpenTimeoutMs?: number;
  /**
   * Decide whether an error counts toward opening the circuit. Returning
   * false lets permanent/expected errors through without tripping the
   * breaker (see module comment).
   */
  countFailure?: (error: unknown) => boolean;
}

/** Thrown when the breaker is OPEN and a call is rejected without executing. */
export class CircuitOpenError extends Error {
  constructor(message?: string) {
    super(message ?? 'Service temporarily unavailable (circuit open)');
    this.name = 'CircuitOpenError';
  }
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  /** Timestamps of failures within the current window. */
  private failures: number[] = [];
  private openedAt: number | null = null;

  constructor(private readonly options: CircuitBreakerOptions = {}) {}

  /** Current breaker state (useful for logging / health checks). */
  get currentState(): CircuitState {
    return this.state;
  }

  /**
   * Execute `fn` through the breaker.
   *
   * @param fn - The operation to run.
   * @returns The operation result.
   * @throws {CircuitOpenError} If the circuit is open.
   * @throws The original error from `fn` on failure (after recording it).
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const cooldown = this.options.halfOpenTimeoutMs ?? 30_000;
      if (this.openedAt !== null && Date.now() - this.openedAt >= cooldown) {
        // Cooldown elapsed — allow one probe call.
        this.state = 'half-open';
      } else {
        throw new CircuitOpenError();
      }
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /** Manually close the circuit and clear failure history. */
  reset(): void {
    this.recordSuccess();
  }

  private recordSuccess(): void {
    this.failures = [];
    this.openedAt = null;
    this.state = 'closed';
  }

  private recordFailure(error: unknown): void {
    const count = this.options.countFailure?.(error) ?? true;
    if (!count) return;

    const now = Date.now();
    const windowMs = this.options.windowMs ?? 30_000;
    const threshold = this.options.failureThreshold ?? 5;

    this.failures = this.failures.filter((t) => now - t < windowMs);
    this.failures.push(now);

    if (this.failures.length >= threshold) {
      this.state = 'open';
      this.openedAt = now;
    }
  }
}

/**
 * Shared breaker guarding Firestore read/write operations. Only transient
 * failures (unavailable, deadline-exceeded, network errors, …) trip it;
 * permanent rules/config rejections pass through without opening the
 * circuit.
 */
export const firestoreCircuitBreaker = new CircuitBreaker({
  countFailure: isRetryableError,
});
/** Shared breaker guarding Storage uploads/downloads. */
export const storageCircuitBreaker = new CircuitBreaker({
  countFailure: isRetryableError,
});
/** Shared breaker guarding Firebase Auth operations. */
export const authCircuitBreaker = new CircuitBreaker({
  countFailure: isRetryableError,
});

/**
 * Convenience wrapper: run `fn` through `breaker`.
 * Equivalent to `breaker.execute(fn)`.
 */
export function withCircuitBreaker<T>(
  breaker: CircuitBreaker,
  fn: () => Promise<T>
): Promise<T> {
  return breaker.execute(fn);
}