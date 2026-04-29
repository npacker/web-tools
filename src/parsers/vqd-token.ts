/**
 * HTML parsing for DuckDuckGo VQD token scraping.
 */

import { VqdTokenError } from "../duckduckgo/vqd-token-error"

/**
 * Regex matching a VQD token embedded in inline script URLs on the DuckDuckGo homepage,
 * e.g. `/d.js?q=cat&...&vqd=4-39717207539857670938764204880008698093&...`.
 *
 * @const {RegExp}
 * @default
 */
const VQD_TOKEN_PATTERN = /vqd=([\w-]+)/

/**
 * Extract the VQD token from a DuckDuckGo homepage HTML payload.
 *
 * @param html Raw HTML payload containing a VQD token reference.
 * @returns The VQD token value.
 * @throws {VqdTokenError} When no VQD token can be located in the payload.
 */
export function extractVqdToken(html: string): string {
  const match = VQD_TOKEN_PATTERN.exec(html)

  if (match === null) {
    throw new VqdTokenError("token_not_found")
  }

  return match[1]
}
