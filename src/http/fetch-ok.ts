/**
 * Shared `impit` GET helper that throws on non-2xx responses and retries transient failures via `p-retry`.
 */

import pRetry from "p-retry"

import { FetchError } from "./fetch-error"
import { isRetryableFetchError } from "./retry"

import type { RetryOptions } from "./retry"
import type { Impit } from "impit"
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
export async function fetchOk(impit: Impit, url: string, options: RequestOptions): Promise<ReturnType<Impit["fetch"]>> {
  return pRetry(async () => attemptFetch(impit, url, options.signal), {
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

/**
 * Execute a single GET attempt, normalising transport failures into `FetchError`.
 *
 * @param impit Shared HTTP client used for the request.
 * @param url Target URL to fetch.
 * @param signal Signal used to abort the in-flight request.
 * @returns The successful response.
 */
async function attemptFetch(
  impit: Impit,
  url: string,
  signal: AbortSignal
): Promise<Awaited<ReturnType<Impit["fetch"]>>> {
  let response: Awaited<ReturnType<Impit["fetch"]>>

  try {
    response = await impit.fetch(url, {
      method: "GET",
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error
    }

    const message = error instanceof Error ? error.message : String(error)
    throw new FetchError(`Request failed: ${message}`, undefined, url, { cause: error })
  }

  if (!response.ok) {
    throw new FetchError(`HTTP ${response.status} ${response.statusText}`, response.status, url)
  }

  return response
}
