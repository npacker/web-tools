/**
 * Shared `impit` GET helper that throws on non-2xx responses and honours a retry policy.
 */

import { FetchError } from "./fetch-error"
import { withRetry } from "./retry"

import type { RetryHooks, RetryPolicy } from "./retry"
import type { Impit } from "impit"

/**
 * Options passed to every outbound request, primarily to support cancellation and retries.
 */
export interface RequestOptions {
  /** Signal used to abort the in-flight request. */
  signal: AbortSignal
  /** Retry policy applied to the request; when omitted, the call is attempted exactly once. */
  retry?: RetryPolicy
  /** Hook fired between failed attempts, before the backoff sleep. */
  onRetry?: RetryHooks["onRetry"]
}

/**
 * Issue a GET request through the shared `impit` client, throwing `FetchError` on failure or non-2xx.
 *
 * When `options.retry` is provided, transient failures are retried with progressive backoff.
 *
 * @param impit Shared HTTP client used for the request.
 * @param url Target URL to fetch.
 * @param options Options controlling the outbound request.
 * @returns The successful response.
 * @throws {FetchError} When the transport fails or the response carries a non-2xx status.
 */
export async function fetchOk(impit: Impit, url: string, options: RequestOptions): Promise<ReturnType<Impit["fetch"]>> {
  if (options.retry === undefined) {
    return attemptFetch(impit, url, options.signal)
  }

  return withRetry(async () => attemptFetch(impit, url, options.signal), options.retry, options.signal, {
    onRetry: options.onRetry,
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
