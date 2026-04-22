/**
 * `p-retry` type alias, retry predicate, and status-line observer factory shared by all HTTP entry points.
 */

import { FetchError } from "./fetch-error"

import type { Options as PRetryOptions, RetryContext } from "p-retry"

/**
 * Subset of `p-retry` options populated from plugin configuration.
 */
export type RetryOptions = Pick<PRetryOptions, "retries" | "factor" | "minTimeout" | "maxTimeout" | "randomize">
/**
 * HTTP status codes that should trigger a retry when returned by the server.
 */
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])
/**
 * Conversion factor from milliseconds to seconds, used when rendering retry delays.
 */
const MS_PER_SECOND = 1000

/**
 * Determine whether a thrown value represents a transient fetch failure that warrants another attempt.
 *
 * @param error Thrown value caught from a request attempt.
 * @returns `true` when the error is a `FetchError` with either a network-level cause or a retryable HTTP status.
 */
export function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof FetchError)) {
    return false
  }

  if (error.statusCode === undefined) {
    return true
  }

  return RETRYABLE_STATUS_CODES.has(error.statusCode)
}

/**
 * Build an `onFailedAttempt` callback that reports the upcoming retry attempt to a tool status line.
 *
 * @param status Status-line callback supplied by the SDK tool context.
 * @param label Phase name interpolated into the status message, e.g. `"website fetch"`.
 * @returns A `p-retry` `onFailedAttempt` callback bound to the given status line and phase label.
 */
export function createRetryNotifier(
  status: (message: string) => void,
  label: string
): NonNullable<PRetryOptions["onFailedAttempt"]> {
  /**
   * Render the retry message for the next attempt.
   *
   * @param context Retry context supplied by `p-retry`.
   * @param context.attemptNumber 1-based index of the attempt that just failed.
   * @param context.retryDelay Upcoming backoff delay in milliseconds.
   */
  return ({ attemptNumber, retryDelay }: RetryContext): void => {
    status(`Retrying ${label} (attempt ${attemptNumber + 1}) in ${Math.round(retryDelay / MS_PER_SECOND)}s...`)
  }
}
