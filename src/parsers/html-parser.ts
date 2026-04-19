/**
 * HTML parsing utilities for DuckDuckGo search results.
 */

import { JSDOM } from "jsdom"

import { RESULT_LINK_SELECTOR, VQD_INPUT_SELECTOR } from "../constants"

import type { SearchResult } from "../types"

/**
 * Parses web search results from DuckDuckGo HTML.
 *
 * @param html Raw HTML payload returned by the DuckDuckGo HTML endpoint.
 * @param maxResults Upper bound on the number of results to return.
 * @returns Deduplicated list of parsed search results, capped at `maxResults`.
 */
export function parseWebSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []
  const dom = new JSDOM(html)
  const linkElements = dom.window.document.querySelectorAll(RESULT_LINK_SELECTOR)
  const seenUrls = new Set<string>()

  for (const link of linkElements) {
    if (results.length >= maxResults) {
      break
    }

    const url = link.getAttribute("href")

    if (url === null) {
      continue
    }

    if (seenUrls.has(url)) {
      continue
    }

    const label = normalizeText(link.textContent)

    if (label === "") {
      continue
    }

    seenUrls.add(url)
    results.push({ label, url })
  }

  return results
}

/**
 * Extracts the VQD token from a DuckDuckGo homepage HTML payload.
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

/**
 * Normalizes text content by collapsing whitespace.
 *
 * @param text Text to normalize, possibly `null` or `undefined`.
 * @returns The trimmed text with internal whitespace runs collapsed to a single space.
 */
function normalizeText(text: string | null | undefined): string {
  if (text === null || text === undefined) {
    return ""
  }

  return text.replaceAll(/\s+/g, " ").trim()
}
