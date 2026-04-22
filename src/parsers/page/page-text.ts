/**
 * Extract headings and readable body text from a parsed website document.
 */

import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"

import { htmlToMarkdown, htmlToText, normalizeText } from "../../text"

import type { ContentFormat } from "../../config/resolve-config"

/**
 * Structured extraction of the core heading fields on a page.
 */
interface PageHeadings {
  /** Contents of the `<title>` element, or an empty string when absent. */
  title: string
  /** Text of the first `<h1>` element, or an empty string when absent. */
  h1: string
  /** Text of the first `<h2>` element, or an empty string when absent. */
  h2: string
  /** Text of the first `<h3>` element, or an empty string when absent. */
  h3: string
}

/**
 * Internal term-match record produced while building the content window list.
 */
interface TermMatch {
  /** Start offset of the match window within the source text. */
  index: number
  /** Matched substring including surrounding padding. */
  text: string
}

/**
 * Result of building a page excerpt: the (possibly truncated) content and the total length
 * of the full extracted content before truncation or term windowing was applied.
 */
export interface PageExcerpt {
  /** The excerpt actually returned to the caller, already truncated to the requested budget. */
  content: string
  /** Character count of the full extracted content prior to any truncation or windowing. */
  totalLength: number
}

/**
 * Extract the document title and the first heading of each of the first three heading levels.
 *
 * @param dom Parsed website DOM.
 * @returns The extracted heading fields; missing headings default to an empty string.
 */
export function extractHeadings(dom: JSDOM): PageHeadings {
  const { document } = dom.window

  return {
    title: normalizeText(document.querySelector("title")?.textContent),
    h1: normalizeText(document.querySelector("h1")?.textContent),
    h2: normalizeText(document.querySelector("h2")?.textContent),
    h3: normalizeText(document.querySelector("h3")?.textContent),
  }
}

/**
 * Extract the main readable content of the document via Mozilla Readability, falling back to the
 * body's inner HTML when Readability cannot identify an article, then format the HTML into the
 * requested output shape (markdown or plain text).
 *
 * @param html Raw HTML payload.
 * @param url Absolute URL of the page, used by Readability to resolve relative references.
 * @param format Output format applied to the extracted content.
 * @returns The cleaned article content, or an empty string when neither extraction strategy yields content.
 */
function extractVisibleText(html: string, url: string, format: ContentFormat): string {
  const readabilityDom = new JSDOM(html, { url })
  const article = new Readability(readabilityDom.window.document).parse()

  const articleContent = article?.content

  if (articleContent !== null && articleContent !== undefined && articleContent !== "") {
    return formatHtml(articleContent, format)
  }

  const fallbackDom = new JSDOM(html)
  const { body } = fallbackDom.window.document

  return formatHtml(body.innerHTML, format)
}

/**
 * Convert an HTML fragment to the requested output format.
 *
 * @param htmlFragment HTML to convert.
 * @param format Target output format.
 * @returns The formatted content string.
 */
function formatHtml(htmlFragment: string, format: ContentFormat): string {
  switch (format) {
    case "markdown": {
      return htmlToMarkdown(htmlFragment)
    }

    case "text": {
      return htmlToText(htmlFragment)
    }
  }
}

/**
 * Build the visible-text payload for the Visit Website tool: when search terms are supplied
 * and the full text exceeds the budget, concatenate dedup-merged windows around each term;
 * otherwise return a head slice of the full text. Also reports the pre-truncation length
 * so callers can detect truncation and refine with search terms or raise the plugin setting.
 *
 * @param html Raw HTML payload used by Readability to extract the main article text.
 * @param url Absolute URL of the page, passed to Readability for relative-link resolution.
 * @param contentLimit Character budget for the returned text.
 * @param searchTerms Optional search terms biasing content selection.
 * @param format Output format applied to the extracted content.
 * @returns The excerpt and the total length of the full extracted content before truncation.
 */
export function buildPageExcerpt(
  html: string,
  url: string,
  contentLimit: number,
  searchTerms: string[] | undefined,
  format: ContentFormat
): PageExcerpt {
  if (contentLimit <= 0) {
    return { content: "", totalLength: 0 }
  }

  const allContent = extractVisibleText(html, url, format)
  const totalLength = allContent.length

  if (searchTerms !== undefined && searchTerms.length > 0 && contentLimit < totalLength) {
    const sliced = sliceAroundTerms(allContent, searchTerms, contentLimit)

    if (sliced.length > 0) {
      return { content: sliced, totalLength }
    }
  }

  return { content: allContent.slice(0, contentLimit), totalLength }
}

/**
 * Slice a body of text around occurrences of each search term, concatenating dedup-merged
 * windows until the overall `limit` character budget is reached.
 *
 * @param text Full text from which to extract matching windows.
 * @param terms Terms to locate inside `text`.
 * @param limit Total character budget for the concatenated output.
 * @returns The concatenated windows, with overlapping ranges merged into single spans.
 */
function sliceAroundTerms(text: string, terms: string[], limit: number): string {
  if (terms.length === 0 || limit <= 0) {
    return ""
  }

  const windowSize = Math.max(1, Math.floor(limit / (terms.length * 2)))
  const matches = collectTermMatches(text, terms, windowSize).toSorted((a, b) => a.index - b.index)
  let output = ""
  let nextMinIndex = 0

  for (const match of matches) {
    output += match.index >= nextMinIndex ? match.text : match.text.slice(nextMinIndex - match.index)
    nextMinIndex = match.index + match.text.length

    if (output.length >= limit) {
      break
    }
  }

  return output.slice(0, limit)
}

/**
 * Find every occurrence of each term in the source text and return a padded window around each
 * match, using case-insensitive `indexOf` scanning rather than dynamically constructed regexes.
 *
 * @param text Text to scan.
 * @param terms Terms to search for.
 * @param windowSize Number of characters of padding to include on either side of each match.
 * @returns Flattened list of term matches with their source offsets.
 */
function collectTermMatches(text: string, terms: string[], windowSize: number): TermMatch[] {
  const matches: TermMatch[] = []
  const haystack = text.toLowerCase()

  for (const term of terms) {
    if (term === "") {
      continue
    }

    const needle = term.toLowerCase()
    let from = 0
    let hit = haystack.indexOf(needle, from)

    while (hit !== -1) {
      const start = Math.max(0, hit - windowSize)
      const end = Math.min(text.length, hit + needle.length + windowSize)
      matches.push({ index: start, text: text.slice(start, end) })
      from = hit + needle.length
      hit = haystack.indexOf(needle, from)
    }
  }

  return matches
}
