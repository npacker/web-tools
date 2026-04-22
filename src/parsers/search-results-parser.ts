/**
 * HTML parsing for DuckDuckGo web-search result pages.
 */

import { JSDOM } from "jsdom"

import { normalizeText } from "../text"

/**
 * CSS selector matching web search result links on the DuckDuckGo HTML endpoint.
 *
 * @const {string}
 * @default ".result__a"
 */
const SEARCH_RESULT_LINK_SELECTOR = ".result__a"

/**
 * A single parsed web search result.
 */
interface SearchResult {
  /** Human-readable title of the result link. */
  label: string
  /** Destination URL of the result link. */
  url: string
}

/**
 * Parse web search results from DuckDuckGo HTML.
 *
 * @param html Raw HTML payload returned by the DuckDuckGo HTML endpoint.
 * @param maxResults Upper bound on the number of results to return.
 * @returns Deduplicated list of parsed search results, capped at `maxResults`.
 */
export function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = []
  const dom = new JSDOM(html)
  const linkElements = dom.window.document.querySelectorAll(SEARCH_RESULT_LINK_SELECTOR)
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
