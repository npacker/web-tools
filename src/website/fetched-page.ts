/**
 * Shape of a fetched page after classification and per-kind decoding/extraction. Cached
 * and consumed by the Visit Website tool (which narrows on `kind` to select between the
 * HTML-readability pipeline and the pre-extracted-text pipeline) and by the View Images
 * tool (which accepts only `kind === "html"`).
 *
 * Modelled as a discriminated union so the HTML variant carries no stray `title` field:
 * HTML titles are derived from the document at render time, not captured at fetch time.
 */

import type { PageKind } from "./page-kind"

/**
 * HTML page variant: carries the raw HTML string for downstream Readability + heading
 * extraction, with no pre-captured title since headings are parsed from the document.
 */
export interface HtmlFetchedPage {
  /** Discriminant identifying an HTML (or XHTML) payload. */
  kind: "html"
  /** Raw HTML body, still to be parsed by Mozilla Readability. */
  html: string
  /** Effective MIME type used to classify the payload. */
  mimeType: string
}

/**
 * Non-HTML variant: carries text that has already been extracted into its final form
 * (PDF body, raw text, or raw JSON) along with any metadata title captured at fetch time.
 */
export interface NonHtmlFetchedPage {
  /** Discriminant identifying a non-HTML page kind. */
  kind: Exclude<PageKind, "html">
  /** Pre-extracted text payload ready for the text excerpt pipeline. */
  text: string
  /** Effective MIME type used to classify the payload. */
  mimeType: string
  /** Document-level title when the source format exposes one (for example PDF metadata). */
  title: string
}

/**
 * Discriminated union of the two fetched-page shapes. Consumers narrow via `page.kind`.
 */
export type FetchedPage = HtmlFetchedPage | NonHtmlFetchedPage
