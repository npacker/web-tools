/**
 * Server-side request forgery (SSRF) guard, delegating all classification to `dssrf`.
 */

import { is_url_safe } from "dssrf"

import { FetchError } from "./fetch-error"

/**
 * Reject the URL if `dssrf` deems it unsafe (non-HTTP scheme, malformed, or resolving to a
 * private/reserved IP range). `is_url_safe` performs a double DNS resolution with a randomised
 * delay to mitigate DNS rebinding before the actual request.
 *
 * @param url Target URL to validate before issuing an outbound request.
 * @returns A promise that resolves when the destination is permitted.
 * @throws {FetchError} When the URL is malformed, uses a non-HTTP scheme, or resolves to a blocked IP.
 */
export async function assertPublicUrl(url: string): Promise<void> {
  const safe = await is_url_safe(url).catch(() => false)

  if (!safe) {
    throw new FetchError("Destination not allowed", undefined, url)
  }
}
