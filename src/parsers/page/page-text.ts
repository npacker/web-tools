/**
 * Extract headings and readable body text from a parsed website document.
 */

import { Readability } from "@mozilla/readability"
import Fuse from "fuse.js"
import { JSDOM } from "jsdom"

import { htmlToMarkdown, htmlToText, normalizeText } from "../../text"

import type { ContentFormat } from "../../config/resolve-config"

/**
 * Maximum Fuse.js relevance score (0 = exact match, 1 = match anything) at which a paragraph
 * is considered a fuzzy hit for a search term. Tightened from the library default (0.6) to
 * avoid returning chunks whose match is essentially noise.
 *
 * @const {number}
 * @default
 */
const FUSE_SCORE_THRESHOLD = 0.3

/**
 * Paragraph separator used when joining the selected chunks back together for emission.
 *
 * @const {string}
 * @default
 */
const CHUNK_JOIN_SEPARATOR = "\n\n"

/**
 * Empty headings record used when jsdom cannot parse the input at all.
 *
 * @const {PageHeadings}
 * @default
 */
const EMPTY_HEADINGS: PageHeadings = { title: "", h1: "", h2: "" }

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
 * Combined headings + excerpt payload for an HTML page, produced by a single jsdom parse.
 */
export interface HtmlPageResult {
  /** Extracted heading fields (title and first h1/h2); empty strings when unparseable. */
  headings: PageHeadings
  /** Content excerpt along with the pre-truncation length. */
  excerpt: PageExcerpt
}

/**
 * Extract headings and a size-bounded content excerpt from an HTML page in a single jsdom
 * parse. Headings are read before Mozilla Readability is invoked because Readability mutates
 * its input document, stripping the chrome (nav, sidebars) that might otherwise hide a page's
 * `<title>` or leading `<h1>` from later queries.
 *
 * @param html Raw HTML payload.
 * @param url Absolute URL of the page, used by Readability to resolve relative references.
 * @param contentLimit Character budget for the returned excerpt.
 * @param searchTerms Optional search terms biasing excerpt selection.
 * @param format Output format applied to the extracted content.
 * @returns The combined headings and excerpt for the page.
 */
export function extractHtmlPage(
  html: string,
  url: string,
  contentLimit: number,
  searchTerms: string[] | undefined,
  format: ContentFormat
): HtmlPageResult {
  const dom = buildDom(html, url)

  if (dom === undefined) {
    return { headings: EMPTY_HEADINGS, excerpt: applyContentLimit(html, contentLimit, searchTerms) }
  }

  const headings = extractHeadingsFromDom(dom)

  if (contentLimit <= 0) {
    return { headings, excerpt: { content: "", totalLength: 0 } }
  }

  return { headings, excerpt: applyContentLimit(extractVisibleText(dom, format), contentLimit, searchTerms) }
}

/**
 * Build a size-bounded excerpt from a pre-extracted text body (PDF text, raw text, JSON).
 *
 * @param text Full text payload already extracted by the caller.
 * @param contentLimit Character budget for the returned text.
 * @param searchTerms Optional search terms biasing content selection.
 * @returns The excerpt and the total length of the full text before truncation.
 */
export function buildTextExcerpt(text: string, contentLimit: number, searchTerms: string[] | undefined): PageExcerpt {
  return applyContentLimit(text, contentLimit, searchTerms)
}

/**
 * Parse HTML into a jsdom instance carrying the absolute URL so Readability can resolve
 * relative references, returning `undefined` when jsdom cannot construct the DOM.
 *
 * @param html Raw HTML payload.
 * @param url Absolute URL of the page.
 * @returns The constructed jsdom instance, or `undefined` on parse failure.
 */
function buildDom(html: string, url: string): JSDOM | undefined {
  try {
    return new JSDOM(html, { url })
  } catch {
    return undefined
  }
}

/**
 * Extract the document title and the first h1/h2 from a jsdom document.
 *
 * @param dom Jsdom instance wrapping the parsed HTML document.
 * @returns The extracted heading fields, each empty when the corresponding element is missing.
 */
function extractHeadingsFromDom(dom: JSDOM): PageHeadings {
  const { document } = dom.window

  return {
    title: normalizeText(document.querySelector("title")?.textContent),
    h1: normalizeText(document.querySelector("h1")?.textContent),
    h2: normalizeText(document.querySelector("h2")?.textContent),
  }
}

/**
 * Extract the main readable content via Mozilla Readability, falling back to the body's inner
 * HTML when Readability can't identify an article.
 *
 * @param dom Jsdom instance wrapping the parsed HTML document.
 * @param format Output format applied to the extracted content.
 * @returns The extracted content, formatted into the requested output shape.
 */
function extractVisibleText(dom: JSDOM, format: ContentFormat): string {
  const articleContent = runReadability(dom)

  if (articleContent !== undefined && articleContent !== "") {
    return formatHtml(articleContent, format)
  }

  return formatHtml(dom.window.document.body.innerHTML, format)
}

/**
 * Run Mozilla Readability against the supplied document, returning its extracted article
 * HTML or `undefined` when Readability throws or finds nothing.
 *
 * @param dom Jsdom instance whose document Readability will parse and mutate in place.
 * @returns The article HTML, or `undefined` when extraction fails.
 */
function runReadability(dom: JSDOM): string | undefined {
  try {
    return new Readability(dom.window.document).parse()?.content ?? undefined
  } catch {
    return undefined
  }
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
 * Apply the shared content-limit policy: when search terms are supplied and the full text
 * exceeds the budget, concatenate the highest-scoring paragraphs selected via fuzzy matching;
 * otherwise return a head slice. Also reports the pre-truncation length so callers can detect
 * truncation and refine with search terms or raise the plugin setting.
 *
 * @param text Full text to excerpt.
 * @param contentLimit Character budget for the returned text.
 * @param searchTerms Optional search terms biasing content selection.
 * @returns The excerpt and the total length of the full text before truncation.
 */
function applyContentLimit(text: string, contentLimit: number, searchTerms: string[] | undefined): PageExcerpt {
  if (contentLimit <= 0) {
    return { content: "", totalLength: 0 }
  }

  const totalLength = text.length

  if (searchTerms !== undefined && searchTerms.length > 0 && contentLimit < totalLength) {
    const sliced = sliceAroundTerms(text, searchTerms, contentLimit)

    if (sliced.length > 0) {
      return { content: sliced, totalLength }
    }
  }

  return { content: text.slice(0, contentLimit), totalLength }
}

/**
 * Select the paragraphs that best match the supplied search terms via Fuse.js fuzzy matching,
 * grow outward through their neighbouring paragraphs until the character budget is exhausted,
 * and concatenate the result in document order. Fuzzy matching tolerates typos, inflections,
 * and partial word overlaps that a case-insensitive `indexOf` scan would miss, while still
 * favouring exact matches (which score near zero). The symmetric expansion ensures a large
 * `contentLimit` is actually filled with surrounding context instead of leaving budget unused
 * when only a handful of paragraphs match.
 *
 * @param text Full text from which to extract matching paragraphs.
 * @param terms Terms to locate inside `text`.
 * @param limit Total character budget for the concatenated output.
 * @returns The concatenated paragraphs, emitted in source order, truncated to `limit`.
 */
function sliceAroundTerms(text: string, terms: string[], limit: number): string {
  if (terms.length === 0 || limit <= 0) {
    return ""
  }

  const chunks = splitIntoChunks(text)

  if (chunks.length === 0) {
    return ""
  }

  const rankedIndices = rankChunksByTerms(chunks, terms)

  if (rankedIndices.length === 0) {
    return ""
  }

  const selected = selectAroundMatches(rankedIndices, chunks, limit)

  if (selected.size === 0) {
    return ""
  }

  return [...selected]
    .toSorted((a, b) => a - b)
    .map(index => chunks[index])
    .join(CHUNK_JOIN_SEPARATOR)
    .slice(0, limit)
}

/**
 * Grow a selection outward from each ranked match, adding paragraphs in priority order (matches
 * first, then the ±1 neighbours of every match, then ±2, and so on) until the character budget
 * is filled. Higher-scoring matches and their inner neighbourhoods are always admitted before
 * lower-scoring matches reach their outer neighbourhoods, preserving the Fuse.js ranking while
 * ensuring the budget is consumed when enough source material is available. Candidates whose
 * inclusion would overshoot the budget are skipped in favour of lower-priority ones that still
 * fit, so no chunk is silently truncated in document order by the final slice. The highest-
 * priority chunk is admitted unconditionally so an oversized top match never yields an empty
 * excerpt (the final slice will trim it to the budget).
 *
 * @param rankedIndices Chunk indices ordered from best to worst fuzzy match.
 * @param chunks Paragraph-level chunks of the page text, indexed in source order.
 * @param limit Character budget to fill, accounting for paragraph separators between chunks.
 * @returns Set of chunk indices chosen for inclusion, unordered.
 */
function selectAroundMatches(rankedIndices: number[], chunks: string[], limit: number): Set<number> {
  const selected = new Set<number>()
  let total = 0

  for (const candidate of prioritizedCandidates(rankedIndices, chunks.length)) {
    if (total >= limit) {
      break
    }

    if (selected.has(candidate)) {
      continue
    }

    const separatorCost = selected.size > 0 ? CHUNK_JOIN_SEPARATOR.length : 0
    const projected = total + separatorCost + chunks[candidate].length

    if (selected.size > 0 && projected > limit) {
      continue
    }

    selected.add(candidate)
    total = projected
  }

  return selected
}

/**
 * Enumerate chunk indices in priority order for symmetric neighbourhood expansion: the matches
 * themselves first, then their ±1 neighbours (iterated across all matches), then ±2, and so on
 * out to the document edges. Duplicate indices are emitted when multiple matches share a
 * neighbour; the caller is expected to deduplicate. Lazy so callers that fill their budget
 * early avoid materializing the tail of the sequence.
 *
 * @param rankedIndices Chunk indices ordered from best to worst fuzzy match.
 * @param chunkCount Total number of chunks in the source document.
 * @yields {number} Candidate chunk indices in emission order.
 */
function* prioritizedCandidates(rankedIndices: number[], chunkCount: number): Generator<number> {
  const lastIndex = chunkCount - 1

  yield* rankedIndices

  let maxReach = 0

  for (const matchIndex of rankedIndices) {
    const reach = Math.max(matchIndex, lastIndex - matchIndex)

    if (reach > maxReach) {
      maxReach = reach
    }
  }

  for (let radius = 1; radius <= maxReach; radius++) {
    for (const matchIndex of rankedIndices) {
      const left = matchIndex - radius
      const right = matchIndex + radius

      if (left >= 0) {
        yield left
      }

      if (right <= lastIndex) {
        yield right
      }
    }
  }
}

/**
 * Rank chunk indices by the best (lowest) Fuse.js score achieved across any of the supplied
 * terms, discarding chunks that fail the score threshold for every term.
 *
 * @param chunks Paragraph-level chunks of the page text, in source order.
 * @param terms Search terms to match against each chunk.
 * @returns Chunk indices ordered from best to worst match.
 */
function rankChunksByTerms(chunks: string[], terms: string[]): number[] {
  const fuse = new Fuse(chunks, {
    includeScore: true,
    ignoreLocation: true,
    threshold: FUSE_SCORE_THRESHOLD,
  })
  const bestScore = new Map<number, number>()

  for (const term of terms) {
    if (term === "") {
      continue
    }

    for (const { refIndex, score } of fuse.search(term)) {
      if (score === undefined) {
        continue
      }

      const current = bestScore.get(refIndex)

      if (current === undefined || score < current) {
        bestScore.set(refIndex, score)
      }
    }
  }

  return [...bestScore.entries()].toSorted(([, a], [, b]) => a - b).map(([index]) => index)
}

/**
 * Split normalized page text into paragraph-level chunks on blank-line boundaries, discarding
 * any empty segments produced by the split.
 *
 * @param text Full page text already normalized to collapse runs of blank lines.
 * @returns Trimmed paragraph chunks in source order.
 */
function splitIntoChunks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph.length > 0)
}
