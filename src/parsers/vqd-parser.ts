/**
 * HTML parsing for DuckDuckGo VQD token scraping.
 */

import { JSDOM } from "jsdom"

/**
 * CSS selector matching the VQD token input element on the DuckDuckGo homepage.
 */
const VQD_INPUT_SELECTOR = 'input[name="vqd"]'

/**
 * Extract the VQD token from a DuckDuckGo homepage HTML payload.
 *
 * @param html Raw HTML payload containing the VQD input element.
 * @returns The VQD token value, or `undefined` when the input is absent or empty.
 */
export function extractVqdToken(html: string): string | undefined {
  const dom = new JSDOM(html)
  const vqdInput = dom.window.document.querySelector(VQD_INPUT_SELECTOR)

  if (vqdInput === null) {
    return undefined
  }

  const value = vqdInput.getAttribute("value")

  return value !== null && value !== "" ? value : undefined
}
