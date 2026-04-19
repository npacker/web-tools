/**
 * HTML parsing utilities for DuckDuckGo search results
 */

import { JSDOM } from "jsdom"

import { RESULT_LINK_SELECTOR, VQD_INPUT_SELECTOR } from "../constants"

import type { SearchResult } from "../types"

/**
 * Parses web search results from DuckDuckGo HTML
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
 * Extracts VQD token from DuckDuckGo HTML
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
 * Normalizes text content by collapsing whitespace
 */
function normalizeText(text: string | null | undefined): string {
  if (text === null || text === undefined) {
    return ""
  }

  return text.replaceAll(/\s+/g, " ").trim()
}
