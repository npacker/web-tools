/**
 * HTML parsing for DuckDuckGo web-search result pages.
 */

import { JSDOM } from "jsdom"

import { normalizeText } from "../text"

/**
 * CSS selector matching individual result blocks on the DuckDuckGo HTML endpoint.
 *
 * @const {string}
 * @default
 */
const SEARCH_RESULT_SELECTOR = ".result"

/**
 * CSS selector matching the result link within a result block.
 *
 * @const {string}
 * @default
 */
const SEARCH_RESULT_LINK_SELECTOR = ".result__a"

/**
 * CSS selector matching the snippet element within a result block.
 *
 * @const {string}
 * @default
 */
const SEARCH_RESULT_SNIPPET_SELECTOR = ".result__snippet"

/**
 * Base used to resolve protocol-relative redirect hrefs (e.g. `//duckduckgo.com/l/?...`).
 *
 * @const {string}
 * @default
 */
const REDIRECT_RESOLUTION_BASE = "https://duckduckgo.com/"

/**
 * Host of DuckDuckGo's click-redirect endpoint.
 *
 * @const {string}
 * @default
 */
const REDIRECT_HOST = "duckduckgo.com"

/**
 * Pathname prefix marking a DuckDuckGo redirect URL.
 *
 * @const {string}
 * @default
 */
const REDIRECT_PATH_PREFIX = "/l/"

/**
 * Query parameter on DuckDuckGo redirect URLs that holds the encoded destination.
 *
 * @const {string}
 * @default
 */
const REDIRECT_TARGET_PARAM = "uddg"

/**
 * Unwrap a DuckDuckGo redirect href to its underlying destination URL.
 *
 * Result links on the HTML endpoint are wrapped as
 * `//duckduckgo.com/l/?uddg=<encoded-target>&...`. The destination is already
 * URL-encoded in the `uddg` parameter, so it can be recovered locally without
 * a network round-trip. Non-redirect or malformed hrefs are returned as-is.
 *
 * @param href Raw `href` attribute value from a result link.
 * @returns The destination URL when it can be extracted, otherwise the original href.
 */
function unwrapRedirect(href: string): string {
  let parsed: URL

  try {
    parsed = new URL(href, REDIRECT_RESOLUTION_BASE)
  } catch {
    return href
  }

  if (parsed.host !== REDIRECT_HOST || !parsed.pathname.startsWith(REDIRECT_PATH_PREFIX)) {
    return href
  }

  const target = parsed.searchParams.get(REDIRECT_TARGET_PARAM)

  if (target === null || target === "") {
    return href
  }

  return target
}

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

    const href = link.getAttribute("href")

    if (href === null) {
      continue
    }

    const url = unwrapRedirect(href)

    if (seenUrls.has(url)) {
      continue
    }

    const label = normalizeText(link.textContent)

    if (label === "") {
      continue
    }

    const snippetElement = block.querySelector(SEARCH_RESULT_SNIPPET_SELECTOR)
    const snippet = normalizeText(snippetElement?.textContent)

    seenUrls.add(url)
    results.push({ label, url, snippet })
  }

  return results
}
