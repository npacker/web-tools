/**
 * Shared `impit` GET helper that throws on non-2xx responses.
 */

import { FetchError } from "./fetch-error"

import type { Impit } from "impit"

/**
 * Options passed to every outbound request, primarily to support cancellation.
 */
export interface RequestOptions {
  /** Signal used to abort the in-flight request. */
  signal: AbortSignal
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
  let response: Awaited<ReturnType<Impit["fetch"]>>

  try {
    response = await impit.fetch(url, {
      method: "GET",
      signal: options.signal,
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
