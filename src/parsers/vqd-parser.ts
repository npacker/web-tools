/**
 * HTML parsing for DuckDuckGo VQD token scraping.
 */

import { JSDOM } from "jsdom"

import { VqdTokenError } from "../errors"

/**
 * CSS selector matching the VQD token input element on the DuckDuckGo homepage.
 */
const VQD_INPUT_SELECTOR = 'input[name="vqd"]'

/**
 * Extract the VQD token from a DuckDuckGo homepage HTML payload.
 *
 * @param html Raw HTML payload containing the VQD input element.
 * @returns The VQD token value.
 * @throws {VqdTokenError} When the input element is absent or its value is empty.
 */
export function extractVqdToken(html: string): string {
  const dom = new JSDOM(html)
  const vqdInput = dom.window.document.querySelector(VQD_INPUT_SELECTOR)

  if (vqdInput === null) {
    throw new VqdTokenError()
  }

  const value = vqdInput.getAttribute("value")

  if (value === null || value === "") {
    throw new VqdTokenError()
  }

  return value
}
