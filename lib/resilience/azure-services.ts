/**
 * Resilient wrappers for Azure service calls.
 *
 * Combines the circuit breaker and retry modules to provide fault-tolerant
 * access to Azure OpenAI and Azure Document Intelligence.  Each service gets
 * its own circuit breaker singleton so that an outage in one does not block
 * the other.
 */

import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker";
import { withRetry } from "./retry";

// ---------------------------------------------------------------------------
// Re-export for convenience
// ---------------------------------------------------------------------------

export { CircuitOpenError } from "./circuit-breaker";

// ---------------------------------------------------------------------------
// Singleton circuit breakers
// ---------------------------------------------------------------------------

export const openAICircuit = new CircuitBreaker({
  name: "AzureOpenAI",
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 1,
});

export const docIntelCircuit = new CircuitBreaker({
  name: "AzureDocumentIntelligence",
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 1,
});

// ---------------------------------------------------------------------------
// Resilient call wrappers
// ---------------------------------------------------------------------------

/**
 * Execute `fn` (an Azure OpenAI call) with retry + circuit breaker.
 *
 * Retry is applied *inside* the circuit breaker so that transient failures
 * are retried before counting against the breaker threshold.
 */
export async function resilientOpenAICall<T>(fn: () => Promise<T>): Promise<T> {
  return openAICircuit.execute(() =>
    withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 15_000,
    }),
  );
}

/**
 * Execute `fn` (a Document Intelligence call) with retry + circuit breaker.
 */
export async function resilientDocIntelCall<T>(fn: () => Promise<T>): Promise<T> {
  return docIntelCircuit.execute(() =>
    withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 15_000,
    }),
  );
}
