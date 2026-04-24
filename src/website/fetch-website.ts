/**
 * Fetch arbitrary websites, classify the response into one of the supported content kinds,
 * and return a discriminated `FetchedPage` so downstream tools can narrow on kind without
 * re-reading the response body. Cached on disk by URL with TTL.
 */

import { decodeBytes, fetchOk, readLimitedBytes } from "../http"
import { extractPdfContent } from "../parsers/page/pdf-text"

import { classifyPage, type PageKind } from "./page-kind"

import type { TTLCache } from "../cache"
import type { RequestOptions } from "../http"
import type { FetchedPage } from "./fetched-page"
import type { Impit } from "impit"

/**
 * Options controlling an outbound website fetch.
 */
interface FetchWebsiteOptions extends RequestOptions {
  /** Hard upper bound on the response payload, in bytes. */
  maxBytes: number
}

/**
 * Fetch the page at `url`, returning a cached payload when one is available. The response
 * is buffered as bytes, classified by declared or sniffed MIME type, and decoded into the
 * kind-specific variant of `FetchedPage`.
 *
 * @param impit Shared HTTP client used for the request.
 * @param cache Cache holding recent fetched pages keyed by URL.
 * @param url Target URL to fetch.
 * @param options Options controlling the outbound request.
 * @returns The structured, classified page payload.
 * @throws {FetchError} When the response carries a non-2xx status or exceeds the size cap.
 * @throws {UnsupportedContentTypeError} When the response's content type is outside the whitelist.
 */
export async function fetchWebsite(
  impit: Impit,
  cache: TTLCache<FetchedPage>,
  url: string,
  options: FetchWebsiteOptions
): Promise<FetchedPage> {
  const cached = await cache.get(url)

  if (cached !== undefined) {
    return cached
  }

  const response = await fetchOk(impit, url, options)
  const bytes = await readLimitedBytes(response, options.maxBytes, url)
  const contentTypeHeader = response.headers.get("content-type")
  const { kind, mimeType } = await classifyPage(bytes, contentTypeHeader, url)
  const page = await materializeFetchedPage(kind, mimeType, bytes, contentTypeHeader)
  await cache.set(url, page)

  return page
}

/**
 * Dispatch on the resolved kind to produce the corresponding `FetchedPage` variant:
 * HTML is decoded into a raw string for downstream Readability, PDF is run through
 * pdfjs to pull both text and metadata title, and text/JSON fall through a shared
 * charset-aware decode path.
 *
 * @param kind Resolved page kind.
 * @param mimeType Effective MIME type that informed the kind.
 * @param bytes Raw response body.
 * @param contentTypeHeader Raw `content-type` header value, or `null` when absent.
 * @returns The kind-specific fetched-page record.
 */
async function materializeFetchedPage(
  kind: PageKind,
  mimeType: string,
  bytes: Buffer,
  contentTypeHeader: string | null
): Promise<FetchedPage> {
  if (kind === "html") {
    return { kind, html: decodeBytes(bytes, contentTypeHeader), mimeType }
  }

  if (kind === "pdf") {
    const { text, title } = await extractPdfContent(bytes)

    return { kind, text, title, mimeType }
  }

  return { kind, text: decodeBytes(bytes, contentTypeHeader), mimeType, title: "" }
}
