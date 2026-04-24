/**
 * Per-kind rendering that assembles the Visit Website tool's response by narrowing on the
 * fetched page's kind. HTML runs a single jsdom parse that yields both headings and the
 * format-aware excerpt; every non-HTML kind (PDF, plain text, JSON) feeds its pre-extracted
 * text straight through the text excerpt pipeline.
 */

import { buildTextExcerpt, extractHtmlPage } from "../parsers"

import type { FetchedPage } from "./fetched-page"
import type { ContentFormat } from "../config/resolve-config"

/**
 * Shape returned by the Visit Website tool. Only fields populated for the underlying kind
 * are present; empty strings are stripped so the model sees a compact payload.
 */
export interface VisitWebsiteResult {
  /** URL that was visited, echoed back for traceability. */
  url: string
  /** Classified page kind so the model can reason about what it received. */
  kind: FetchedPage["kind"]
  /** Effective MIME type reported by the server or sniffed from the payload. */
  mimeType: string
  /** Page title when available (HTML `<title>` or PDF metadata `Title`). */
  title?: string
  /** First `<h1>` of an HTML page, omitted for non-HTML kinds. */
  h1?: string
  /** First `<h2>` of an HTML page, omitted for non-HTML kinds. */
  h2?: string
  /** Excerpt of the page content, truncated to the configured character budget. */
  content?: string
  /** Character count of the full extracted content before truncation or windowing. */
  contentLength?: number
}

/**
 * Inputs shared by both excerpt paths (HTML and pre-extracted text).
 */
export interface ExcerptInputs {
  /** Character budget for the returned excerpt. */
  contentLimit: number
  /** Optional search terms biasing content selection. */
  findInPage: string[] | undefined
  /** Output format applied to HTML content; the pre-extracted-text path ignores it. */
  contentFormat: ContentFormat
}

/**
 * Assemble the per-kind response payload, narrowing on the fetched page's kind to select
 * between the HTML jsdom+Readability pipeline and the pre-extracted-text pipeline.
 *
 * @param url URL that was visited.
 * @param page Fetched and classified page payload.
 * @param inputs Shared excerpt inputs.
 * @returns The user-facing result with content and (for HTML) headings populated.
 */
export function renderVisitResult(url: string, page: FetchedPage, inputs: ExcerptInputs): VisitWebsiteResult {
  if (page.kind === "html") {
    const { headings, excerpt } = extractHtmlPage(
      page.html,
      url,
      inputs.contentLimit,
      inputs.findInPage,
      inputs.contentFormat
    )

    return assembleResult({
      url,
      kind: page.kind,
      mimeType: page.mimeType,
      title: headings.title,
      h1: headings.h1,
      h2: headings.h2,
      content: excerpt.content,
      contentLength: excerpt.totalLength,
    })
  }

  const excerpt = buildTextExcerpt(page.text, inputs.contentLimit, inputs.findInPage)

  return assembleResult({
    url,
    kind: page.kind,
    mimeType: page.mimeType,
    title: page.title,
    content: excerpt.content,
    contentLength: excerpt.totalLength,
  })
}

/**
 * Populated candidate fields for a Visit Website result, before empty strings and zero-length
 * counts are stripped. Accepting this shape centralises the "drop-empty-fields" policy so the
 * HTML and non-HTML branches don't repeat the conditional spread six times each.
 */
interface ResultFields {
  /** URL that was visited. */
  url: string
  /** Classified page kind. */
  kind: FetchedPage["kind"]
  /** Effective MIME type. */
  mimeType: string
  /** Candidate title; dropped when empty. */
  title?: string
  /** Candidate h1; dropped when empty. */
  h1?: string
  /** Candidate h2; dropped when empty. */
  h2?: string
  /** Candidate content; dropped when empty. */
  content?: string
  /** Candidate content length; dropped when zero. */
  contentLength?: number
}

/**
 * Collapse a `ResultFields` record into the user-facing response by stripping empty strings
 * and zero-length counts. Callers pass every candidate field whether populated or not; this
 * helper owns the policy of "don't emit empties" so the per-kind branches stay linear.
 *
 * @param fields Candidate result fields.
 * @returns The response with empty/zero fields removed.
 */
function assembleResult(fields: ResultFields): VisitWebsiteResult {
  const result: VisitWebsiteResult = { url: fields.url, kind: fields.kind, mimeType: fields.mimeType }

  if (fields.title !== undefined && fields.title.length > 0) {
    result.title = fields.title
  }

  if (fields.h1 !== undefined && fields.h1.length > 0) {
    result.h1 = fields.h1
  }

  if (fields.h2 !== undefined && fields.h2.length > 0) {
    result.h2 = fields.h2
  }

  if (fields.content !== undefined && fields.content.length > 0) {
    result.content = fields.content
  }

  if (fields.contentLength !== undefined && fields.contentLength > 0) {
    result.contentLength = fields.contentLength
  }

  return result
}
