/**
 * Circuit Breaker pattern implementation for protecting Azure service calls.
 *
 * States:
 *   CLOSED   -- normal operation; failures are counted
 *   OPEN     -- circuit tripped; calls are rejected immediately
 *   HALF_OPEN -- recovery probe; one call is allowed through to test recovery
 *
 * State transitions:
 *   CLOSED  -> OPEN      when consecutive failures >= failureThreshold
 *   OPEN    -> HALF_OPEN after resetTimeoutMs has elapsed
 *   HALF_OPEN -> CLOSED  on a successful probe call
 *   HALF_OPEN -> OPEN    on a failed probe call
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Human-readable name for logging. */
  name: string;
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Milliseconds to wait in OPEN before allowing a half-open probe. Default: 60000 */
  resetTimeoutMs?: number;
  /** Number of successful probes required before fully closing. Default: 1 */
  halfOpenMaxAttempts?: number;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastStateChange?: Date;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class CircuitOpenError extends Error {
  public readonly circuitName: string;

  constructor(circuitName: string) {
    super(
      `Circuit breaker "${circuitName}" is OPEN -- calls are being rejected to protect the downstream service.`,
    );
    this.name = "CircuitOpenError";
    this.circuitName = circuitName;
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class CircuitBreaker {
  private readonly _name: string;
  private readonly _failureThreshold: number;
  private readonly _resetTimeoutMs: number;
  private readonly _halfOpenMaxAttempts: number;

  private _state: CircuitState = "closed";
  private _failures = 0;
  private _successes = 0;
  private _halfOpenSuccesses = 0;
  private _lastFailure: Date | undefined;
  private _lastStateChange: Date | undefined;
  private _openedAt: number | undefined;

  constructor(options: CircuitBreakerOptions) {
    this._name = options.name;
    this._failureThreshold = options.failureThreshold ?? 5;
    this._resetTimeoutMs = options.resetTimeoutMs ?? 60_000;
    this._halfOpenMaxAttempts = options.halfOpenMaxAttempts ?? 1;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Execute `fn` through the circuit breaker.
   *
   * - In CLOSED state the function runs normally.
   * - In OPEN state a `CircuitOpenError` is thrown immediately.
   * - In HALF_OPEN state the function runs as a recovery probe.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if an OPEN circuit should transition to HALF_OPEN
    if (this._state === "open") {
      if (this._openedAt && Date.now() - this._openedAt >= this._resetTimeoutMs) {
        this._transitionTo("half-open");
      } else {
        throw new CircuitOpenError(this._name);
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  getState(): CircuitState {
    // Auto-transition if timeout has elapsed (for callers that check state
    // without calling execute)
    if (
      this._state === "open" &&
      this._openedAt &&
      Date.now() - this._openedAt >= this._resetTimeoutMs
    ) {
      this._transitionTo("half-open");
    }
    return this._state;
  }

  getStats(): CircuitBreakerStats {
    return {
      name: this._name,
      state: this.getState(),
      failures: this._failures,
      successes: this._successes,
      lastFailure: this._lastFailure,
      lastStateChange: this._lastStateChange,
    };
  }

  /**
   * Manually reset the circuit to CLOSED. Useful for administrative overrides.
   */
  reset(): void {
    this._failures = 0;
    this._halfOpenSuccesses = 0;
    this._transitionTo("closed");
  }

  // -----------------------------------------------------------------------
  // Internal state management
  // -----------------------------------------------------------------------

  private _onSuccess(): void {
    this._successes++;

    if (this._state === "half-open") {
      this._halfOpenSuccesses++;
      if (this._halfOpenSuccesses >= this._halfOpenMaxAttempts) {
        this._failures = 0;
        this._halfOpenSuccesses = 0;
        this._transitionTo("closed");
      }
    } else {
      // In CLOSED state, a success resets the failure counter
      this._failures = 0;
    }
  }

  private _onFailure(): void {
    this._failures++;
    this._lastFailure = new Date();

    if (this._state === "half-open") {
      // Probe failed -- re-open immediately
      this._halfOpenSuccesses = 0;
      this._transitionTo("open");
    } else if (this._state === "closed") {
      if (this._failures >= this._failureThreshold) {
        this._transitionTo("open");
      }
    }
    // If already OPEN (shouldn't happen in execute path), ignore.
  }

  private _transitionTo(newState: CircuitState): void {
    if (this._state === newState) return;

    const prev = this._state;
    this._state = newState;
    this._lastStateChange = new Date();

    if (newState === "open") {
      this._openedAt = Date.now();
    }

    console.log(
      `[circuit-breaker] "${this._name}" transitioned: ${prev} -> ${newState}`,
    );
  }
}
