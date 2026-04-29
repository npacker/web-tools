/**
 * Text extraction for PDF payloads via `@opendocsg/pdf2md`. The library wraps `unpdf` (and
 * through it `pdfjs-dist`) with a Markdown converter that does font-size-based heading
 * detection and paragraph grouping, producing structured output that aligns with the Visit
 * Website tool's HTML → turndown pipeline and survives the downstream excerpt windowing.
 *
 * The document `Title` from the PDF metadata dictionary is pulled via `unpdf.getMeta` in a
 * parallel pass — pdf2md's `metadataParsed` callback could supply the same data, but
 * wiring a closure-captured mutable reference through the ESLint ruleset adds more noise
 * than the second cheap metadata pass it would save.
 */

import pdf2md from "@opendocsg/pdf2md"
import { getMeta } from "unpdf"

import { normalizeBlankLines } from "../../text"

/**
 * Result of extracting text and metadata from a PDF buffer.
 */
export interface PdfContent {
  /** Concatenated Markdown content extracted from every page, in page order. */
  text: string
  /** Document-metadata title when present and non-empty, otherwise an empty string. */
  title: string
}

/**
 * Extract readable Markdown and the document title from a PDF payload.
 *
 * @param bytes Raw PDF bytes.
 * @returns The extracted Markdown body and metadata title.
 * @throws {Error} When `pdf2md` or `unpdf` cannot parse the payload.
 */
export async function extractPdfContent(bytes: Buffer): Promise<PdfContent> {
  const data = new Uint8Array(bytes)
  const [markdown, meta] = await Promise.all([pdf2md(data), getMeta(data)])
  const info = meta.info as Record<string, unknown>
  const rawTitle = info.Title

  return {
    text: normalizeBlankLines(markdown),
    title: typeof rawTitle === "string" ? rawTitle.trim() : "",
  }
}
