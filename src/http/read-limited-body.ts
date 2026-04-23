/**
 * Bounded response-body readers that reject payloads exceeding a byte ceiling.
 *
 * Backed by `raw-body`, which performs the `Content-Length` pre-check, streaming drain,
 * limit enforcement, and charset-aware decoding via `iconv-lite` in one call. Stream
 * cancellation on overflow is handled internally by `raw-body`. Charset extraction
 * from the `content-type` header goes through the `content-type` module.
 */

import { Readable } from "node:stream"

import { parse as parseContentType } from "content-type"
import { encodingExists } from "iconv-lite"
import getRawBody from "raw-body"

import { FetchError } from "./fetch-error"

import type { ImpitResponse } from "impit"

/**
 * Number of bytes in one megabyte, used when rendering the overflow message.
 *
 * @const {number}
 * @default
 */
const BYTES_PER_MB = 1024 * 1024

/**
 * Number of decimal places used when rendering the byte limit as megabytes.
 *
 * @const {number}
 * @default
 */
const MB_MESSAGE_FRACTION_DIGITS = 1

/**
 * Default character set applied when the response omits `charset` or advertises an
 * encoding that `iconv-lite` does not recognise.
 *
 * @const {string}
 * @default
 */
const DEFAULT_CHARSET = "utf8"

/**
 * Shape of the error object `raw-body` rejects with on limit violations or malformed
 * streams. Declared locally because the library's `RawBodyError` type is not exported
 * from its main entry point.
 */
interface RawBodyError {
  /** Categorical tag; `"entity.too.large"` signals a limit violation. */
  type: string
  /** Number of bytes received before the error fired, when applicable. */
  received?: number
}

/**
 * Read a response body into a `Buffer`, rejecting payloads larger than `maxBytes`.
 *
 * @param response Response produced by the shared `impit` client.
 * @param maxBytes Hard upper bound on the accumulated payload, in bytes.
 * @param url Target URL used when composing the `FetchError` for diagnostics.
 * @returns The fully received payload as a `Buffer`.
 * @throws {FetchError} When the body length exceeds `maxBytes`.
 */
export async function readLimitedBytes(response: ImpitResponse, maxBytes: number, url: string): Promise<Buffer> {
  try {
    return await getRawBody(toNodeReadable(response), {
      limit: maxBytes,
      length: parseContentLength(response),
    })
  } catch (error) {
    throw mapError(error, maxBytes, url)
  }
}

/**
 * Read a response body as a decoded string, rejecting payloads larger than `maxBytes`.
 *
 * The declared `charset` of the response's `content-type` header is honoured when
 * `iconv-lite` recognises the label; otherwise UTF-8 is substituted so exotic
 * encodings cannot wedge the tool.
 *
 * @param response Response produced by the shared `impit` client.
 * @param maxBytes Hard upper bound on the accumulated payload, in bytes.
 * @param url Target URL used when composing the `FetchError` for diagnostics.
 * @returns The decoded body as a string.
 * @throws {FetchError} When the body length exceeds `maxBytes`.
 */
export async function readLimitedText(response: ImpitResponse, maxBytes: number, url: string): Promise<string> {
  try {
    return await getRawBody(toNodeReadable(response), {
      limit: maxBytes,
      length: parseContentLength(response),
      encoding: resolveEncoding(response.headers.get("content-type")),
    })
  } catch (error) {
    throw mapError(error, maxBytes, url)
  }
}

/**
 * Adapt the response's Web-Streams body into a Node `Readable` so `raw-body` can
 * consume it.
 *
 * @param response Response whose body stream is being drained.
 * @returns A Node `Readable` that proxies the response body.
 */
function toNodeReadable(response: ImpitResponse): Readable {
  return Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0])
}

/**
 * Parse the `Content-Length` header as a non-negative integer for `raw-body`'s
 * pre-check. A missing or malformed header yields `undefined`, deferring enforcement
 * to the streaming check.
 *
 * @param response Response whose headers should be inspected.
 * @returns The declared length, or `undefined` when unknown.
 */
function parseContentLength(response: ImpitResponse): number | undefined {
  const header = response.headers.get("content-length")

  if (header === null) {
    return undefined
  }

  const declared = Number.parseInt(header, 10)

  return Number.isFinite(declared) ? declared : undefined
}

/**
 * Resolve the charset for text decoding, falling back to UTF-8 when the declared
 * charset is missing or not recognised by `iconv-lite`.
 *
 * @param contentType Raw `content-type` header value, or `null` when absent.
 * @returns A charset label accepted by `iconv-lite`.
 */
function resolveEncoding(contentType: string | null): string {
  const charset = extractCharset(contentType)

  if (charset === undefined) {
    return DEFAULT_CHARSET
  }

  return encodingExists(charset) ? charset : DEFAULT_CHARSET
}

/**
 * Parse the `charset` parameter from a `content-type` header value via the `content-type`
 * module. Returns `undefined` when the header is absent, malformed, or carries no charset.
 *
 * @param contentType Raw header value, or `null` when absent.
 * @returns The declared charset, or `undefined` when none can be derived.
 */
function extractCharset(contentType: string | null): string | undefined {
  if (contentType === null) {
    return undefined
  }

  try {
    return parseContentType(contentType).parameters.charset
  } catch {
    return undefined
  }
}

/**
 * Map a thrown value from `raw-body` into a `FetchError`, translating limit violations
 * to the user-facing overflow message and leaving other `Error` instances untouched.
 *
 * @param error Thrown value caught from `getRawBody`.
 * @param maxBytes Hard upper bound on the accumulated payload, in bytes.
 * @param url Target URL carried on the resulting error for diagnostics.
 * @returns An `Error` suitable for rethrowing to the caller.
 */
function mapError(error: unknown, maxBytes: number, url: string): Error {
  if (isRawBodyLimitError(error)) {
    const megabytes = (maxBytes / BYTES_PER_MB).toFixed(MB_MESSAGE_FRACTION_DIGITS)

    return new FetchError(`Response exceeds ${megabytes} MB`, undefined, url, { cause: error })
  }

  if (error instanceof Error) {
    return error
  }

  return new FetchError("Response body read failed", undefined, url, { cause: error })
}

/**
 * Type-guard reporting whether a thrown value is `raw-body`'s limit-violation error.
 *
 * @param error Thrown value caught from `getRawBody`.
 * @returns `true` when the value carries the `"entity.too.large"` tag.
 */
function isRawBodyLimitError(error: unknown): error is RawBodyError {
  if (typeof error !== "object" || error === null) {
    return false
  }

  if (!("type" in error)) {
    return false
  }

  return error.type === "entity.too.large"
}
