/**
 * Circuit breaker for Firebase services.
 *
 * Protects the app (and the backend) from cascading failures: if a service
 * fails N times within a rolling window, the breaker trips to OPEN and calls
 * fail fast for a cooldown period instead of hammering a sick service. After
 * the cooldown it enters HALF-OPEN, allowing a single probe call; success
 * closes the circuit, failure re-opens it.
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
      this.recordFailure();
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

  private recordFailure(): void {
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

/** Breaker guarding Firestore read/write operations. */
export const firestoreCircuitBreaker = new CircuitBreaker();
/** Breaker guarding Storage uploads/downloads. */
export const storageCircuitBreaker = new CircuitBreaker();
/** Breaker guarding Firebase Auth operations. */
export const authCircuitBreaker = new CircuitBreaker();

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