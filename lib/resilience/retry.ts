/**
 * Retry with exponential backoff and jitter.
 *
 * Only transient / retriable errors are retried (e.g. 429, 500, 503,
 * network timeouts).  Client errors (400, 401, 403, 404) are NOT retried
 * because they indicate a problem the caller must fix.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of attempts (including the initial one). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms before the first retry. Default: 1000 */
  baseDelayMs?: number;
  /** Upper bound for computed delay. Default: 30000 */
  maxDelayMs?: number;
  /** Optional predicate to decide if an error is retriable. */
  retryableErrors?: (error: Error) => boolean;
}

// ---------------------------------------------------------------------------
// Default retryable-error classifier
// ---------------------------------------------------------------------------

/**
 * Determines whether an error is transient / retriable.
 *
 * Retriable:
 *   - Network errors (ECONNRESET, ECONNREFUSED, ENOTFOUND, ETIMEDOUT, EPIPE)
 *   - HTTP 429 (rate limit), 500, 502, 503, 504
 *   - Timeout errors
 *
 * NOT retriable:
 *   - HTTP 400, 401, 403, 404 (client errors)
 *   - Validation / auth errors
 */
export function isTransientError(error: Error): boolean {
  const msg = error.message.toLowerCase();

  // Network-level errors
  const networkTokens = [
    "econnreset",
    "econnrefused",
    "enotfound",
    "etimedout",
    "epipe",
    "socket hang up",
    "network",
    "fetch failed",
  ];
  if (networkTokens.some((t) => msg.includes(t))) return true;

  // Timeout
  if (msg.includes("timeout")) return true;

  // HTTP status codes embedded in the error message
  if (/\b(429|500|502|503|504)\b/.test(msg)) return true;

  // Azure-specific transient error codes
  if (msg.includes("rate limit") || msg.includes("throttl")) return true;
  if (msg.includes("temporarily unavailable") || msg.includes("service unavailable")) return true;

  // Check for a `status` or `statusCode` property on the error
  const errWithStatus = error as Error & { status?: number; statusCode?: number };
  const status = errWithStatus.status ?? errWithStatus.statusCode;
  if (status !== undefined) {
    if ([429, 500, 502, 503, 504].includes(status)) return true;
    // Explicitly NOT retriable
    if ([400, 401, 403, 404].includes(status)) return false;
  }

  // Default: not retriable
  return false;
}

// ---------------------------------------------------------------------------
// Delay helper
// ---------------------------------------------------------------------------

function computeDelay(attempt: number, baseMs: number, maxMs: number): number {
  // Exponential: baseMs * 2^attempt
  const exponential = baseMs * Math.pow(2, attempt);
  // Add jitter: random value between 0 and baseMs
  const jitter = Math.random() * baseMs;
  return Math.min(exponential + jitter, maxMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Execute `fn` with retry logic using exponential backoff.
 *
 * @param fn       The async operation to attempt.
 * @param options  Optional retry configuration.
 * @returns        The result of `fn` on success.
 * @throws         The last error encountered if all attempts are exhausted, or
 *                 a non-retriable error immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1_000;
  const maxDelayMs = options?.maxDelayMs ?? 30_000;
  const isRetryable = options?.retryableErrors ?? isTransientError;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;

      // If the error is not transient, don't retry -- throw immediately
      if (!isRetryable(error)) {
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt === maxAttempts - 1) {
        throw error;
      }

      const delay = computeDelay(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `[retry] Attempt ${attempt + 1}/${maxAttempts} failed (${error.message}). ` +
          `Retrying in ${Math.round(delay)}ms...`,
      );

      await sleep(delay);
    }
  }

  // Should never reach here, but satisfy the type checker
  throw lastError ?? new Error("withRetry: unexpected state");
}
