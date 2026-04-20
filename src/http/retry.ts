/**
 * Progressive-backoff retry helper shared by every outbound HTTP call.
 */

import { FetchError } from "./fetch-error"

/**
 * Policy controlling retry attempts and backoff timing.
 */
export interface RetryPolicy {
  /** Maximum number of attempts, including the first. `1` disables retries. */
  maxAttempts: number
  /** Base delay used for the first retry, in milliseconds. Doubled on each subsequent retry. */
  initialBackoffMs: number
  /** Upper bound on any single backoff delay after exponential growth, in milliseconds. */
  maxBackoffMs: number
}
/**
 * Hooks available to retry-aware callers.
 */
export interface RetryHooks {
  /** Invoked after each failed attempt, before the backoff sleep. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
}
/**
 * HTTP status codes that should trigger a retry when returned by the server.
 */
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])

/**
 * Run `function_` under a retry policy, waiting with progressive backoff between attempts.
 *
 * @param function_ Operation to execute; receives the 1-based attempt number.
 * @param policy Retry policy controlling attempt count and backoff timing.
 * @param signal Abort signal honoured by both the operation and the backoff sleep.
 * @param hooks Optional observer hooks fired between attempts.
 * @returns The resolved value from the first successful attempt.
 * @throws {Error} The final error when every attempt fails, or the abort error when cancelled.
 */
export async function withRetry<T>(
  function_: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
  signal: AbortSignal,
  hooks: RetryHooks = {}
): Promise<T> {
  const attempts = Math.max(1, Math.floor(policy.maxAttempts))

  for (let attempt = 1; ; attempt++) {
    try {
      // Retries are inherently sequential; awaiting each attempt inside the loop is required.
      // eslint-disable-next-line no-await-in-loop
      return await function_(attempt)
    } catch (error) {
      if (isAbortError(error) || attempt >= attempts || !isRetryableError(error)) {
        throw error
      }

      const delayMs = computeBackoffDelay(attempt, policy)
      hooks.onRetry?.(error, attempt, delayMs)
      // eslint-disable-next-line no-await-in-loop
      await sleepAbortable(delayMs, signal)
    }
  }
}

/**
 * Compute a jittered, capped exponential backoff delay for a given attempt number.
 *
 * @param attempt 1-based attempt number that just failed.
 * @param policy Retry policy controlling base and cap.
 * @returns The delay to wait before the next attempt, in milliseconds.
 */
function computeBackoffDelay(attempt: number, policy: RetryPolicy): number {
  const base = policy.initialBackoffMs * 2 ** (attempt - 1)
  const capped = Math.min(base, policy.maxBackoffMs)
  // Full jitter on the upper quarter keeps retries well-spaced without cratering throughput.
  // Non-cryptographic randomness is fine for backoff timing.
  // eslint-disable-next-line sonarjs/pseudo-random
  const jitter = Math.random() * capped * 0.25

  return Math.floor(capped + jitter)
}

/**
 * Determine whether a thrown value represents a transient failure that warrants another attempt.
 *
 * @param error Thrown value caught from a request attempt.
 * @returns `true` when the caller should retry.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof FetchError) {
    if (error.statusCode === undefined) {
      return true
    }

    return RETRYABLE_STATUS_CODES.has(error.statusCode)
  }

  // Non-FetchError, non-abort throwables are almost always transport-level — retry them.
  return error instanceof Error
}

/**
 * Sleep for the given duration, resolving early and throwing when the signal aborts.
 *
 * @param ms Duration to sleep, in milliseconds.
 * @param signal Abort signal cancelling the wait.
 * @returns A promise that resolves when the timer elapses.
 * @throws {Error} The signal's abort reason when cancellation fires before the timer.
 */
async function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw signal.reason
  }

  return new Promise((resolve, reject) => {
    /**
     * Cancels the pending timer and rejects the sleep with the signal's abort reason.
     */
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal.reason)
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

/**
 * Determine whether a thrown value represents an abort signal firing.
 *
 * @param error Thrown value to inspect.
 * @returns `true` when the value is a DOM abort error.
 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}
