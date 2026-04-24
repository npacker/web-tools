/**
 * Shared `impit` GET helper that throws on non-2xx responses and retries transient failures via `p-retry`.
 */

import pRetry from "p-retry"

import { followRedirects } from "./follow-redirects"
import { isRetryableFetchError } from "./retry"

import type { RetryOptions } from "./retry"
import type { Impit, ImpitResponse } from "impit"
import type { Options as PRetryOptions } from "p-retry"

/**
 * Options passed to every outbound request, primarily to support cancellation and retries.
 */
export interface RequestOptions {
  /** Signal used to abort the in-flight request. */
  signal: AbortSignal
  /** Retry policy applied to the request; when omitted, the call is attempted exactly once. */
  retry?: RetryOptions
  /** Observer invoked after each failed attempt, before the backoff sleep. */
  onFailedAttempt?: PRetryOptions["onFailedAttempt"]
  /** Extra request headers layered onto the `impit` browser-impersonation defaults. */
  headers?: Record<string, string>
}

/**
 * Issue a GET request through the shared `impit` client, throwing `FetchError` on failure or non-2xx.
 *
 * @param impit Shared HTTP client used for the request.
 * @param url Target URL to fetch.
 * @param options Options controlling the outbound request.
 * @returns The successful response.
 * @throws {FetchError} When the transport fails or the response carries a non-2xx status.
 */
export async function fetchOk(impit: Impit, url: string, options: RequestOptions): Promise<ImpitResponse> {
  return pRetry(async () => followRedirects(impit, url, { signal: options.signal, headers: options.headers }), {
    retries: 0,
    ...options.retry,
    signal: options.signal,

    /**
     * Gate retries on the `FetchError.statusCode` allowlist so non-transient failures fail fast.
     *
     * @param context Retry context supplied by `p-retry`; only `error` is consulted.
     * @param context.error Error thrown by the most recent attempt.
     * @returns `true` when the error is a transient fetch failure that warrants another attempt.
     */
    shouldRetry: ({ error }) => isRetryableFetchError(error),
    onFailedAttempt: options.onFailedAttempt,
  })
}
