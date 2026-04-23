/**
 * HTML parsing for DuckDuckGo web-search result pages.
 */

import { JSDOM } from "jsdom"

import { normalizeText } from "../text"

/**
 * CSS selector matching individual result blocks on the DuckDuckGo HTML endpoint.
 *
 * @const {string}
 * @default ".result"
 */
const SEARCH_RESULT_SELECTOR = ".result"

/**
 * CSS selector matching the result link within a result block.
 *
 * @const {string}
 * @default ".result__a"
 */
const SEARCH_RESULT_LINK_SELECTOR = ".result__a"

/**
 * CSS selector matching the snippet element within a result block.
 *
 * @const {string}
 * @default ".result__snippet"
 */
const SEARCH_RESULT_SNIPPET_SELECTOR = ".result__snippet"

/**
 * Maximum character length for a result snippet.
 *
 * @const {number}
 * @default 300
 */
const MAX_SNIPPET_LENGTH = 300

/**
 * A single parsed web search result.
 */
interface SearchResult {
  /** Human-readable title of the result link. */
  label: string
  /** Destination URL of the result link. */
  url: string
  /** Preview text extracted from the search result page. */
  snippet: string
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
  const resultBlocks = dom.window.document.querySelectorAll(SEARCH_RESULT_SELECTOR)
  const seenUrls = new Set<string>()

  for (const block of resultBlocks) {
    if (results.length >= maxResults) {
      break
    }

    const link = block.querySelector(SEARCH_RESULT_LINK_SELECTOR)

    if (link === null) {
      continue
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

    const snippetElement = block.querySelector(SEARCH_RESULT_SNIPPET_SELECTOR)
    let snippet = normalizeText(snippetElement?.textContent)

    if (snippet.length > MAX_SNIPPET_LENGTH) {
      snippet = `${snippet.slice(0, MAX_SNIPPET_LENGTH)}...`
    }

    seenUrls.add(url)
    results.push({ label, url, snippet })
  }

  return results
}
