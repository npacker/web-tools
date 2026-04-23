/**
 * Factory for the shared `impit` HTTP client.
 *
 * `impit` is used instead of `fetch` because DuckDuckGo's anti-bot layer requires browser-like TLS
 * fingerprints and header ordering. Do not replace it with `fetch` (see commit 9e97d38).
 *
 * Automatic redirect following is disabled here so that every hop can be re-validated through the
 * SSRF guard. Manual redirect handling lives in [fetch-ok.ts](./fetch-ok.ts) and
 * [download-image.ts](../images/download-image.ts).
 */

import { Impit } from "impit"

/**
 * Create a new `impit` client configured with Chrome fingerprints and manual redirect handling.
 *
 * @returns A fresh `Impit` instance.
 */
export function createImpit(): Impit {
  return new Impit({ browser: "chrome", followRedirects: false, maxRedirects: 0 })
}
