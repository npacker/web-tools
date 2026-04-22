/**
 * Retry configuration type and the `FetchError`-aware retry predicate shared by all HTTP entry points.
 */

import { FetchError } from "./fetch-error"

import type { Options as PRetryOptions } from "p-retry"

/**
 * Subset of `p-retry` options populated from plugin configuration.
 */
export type RetryOptions = Pick<PRetryOptions, "retries" | "factor" | "minTimeout" | "maxTimeout" | "randomize">
/**
 * HTTP status codes that should trigger a retry when returned by the server.
 */
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])

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
