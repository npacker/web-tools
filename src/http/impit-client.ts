/**
 * Factory for the shared `impit` HTTP client.
 *
 * `impit` is used instead of `fetch` because DuckDuckGo's anti-bot layer requires browser-like TLS
 * fingerprints and header ordering. Do not replace it with `fetch` (see commit 9e97d38).
 */

import { Impit } from "impit"

/**
 * Create a new `impit` client configured with Chrome fingerprints.
 *
 * @returns A fresh `Impit` instance.
 */
export function createImpit(): Impit {
  return new Impit({ browser: "chrome" })
}
