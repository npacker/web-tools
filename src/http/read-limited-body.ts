/**
 * Bounded response-body readers that enforce a byte ceiling against oversized payloads.
 *
 * Both readers perform a soft pre-check against the `Content-Length` header and a hard
 * streaming check while consuming the body. On overflow the underlying stream is cancelled
 * so the socket is released before the `FetchError` is thrown. `readLimitedText` additionally
 * honours the `charset` parameter of the response's `content-type` header, falling back to
 * UTF-8 when the charset is absent, empty, or unknown to `TextDecoder`.
 */

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
 * Default character set used when the response omits `charset` or supplies an unknown label.
 *
 * @const {string}
 * @default
 */
const DEFAULT_CHARSET = "utf8"

/**
 * One read result yielded by a byte-stream reader.
 */
interface ReadResult {
  /** Set to `true` once the stream has been fully consumed. */
  done: boolean
  /** Chunk produced by this read, or `undefined` when no chunk is available. */
  value?: Uint8Array
}

/**
 * Structural handle matching the subset of `ReadableStreamDefaultReader<Uint8Array>` we use.
 * We intentionally declare this structurally rather than referencing the global
 * `ReadableStream` so the `n/no-unsupported-features/node-builtins` rule does not flag code
 * that merely consumes `impit`'s already-available body stream.
 */
interface ByteStreamReader {
  /** Read the next chunk, resolving with `{ done: true }` when the stream is exhausted. */
  read: () => Promise<ReadResult>
  /** Cancel the underlying stream, releasing the socket. */
  cancel: () => Promise<void>
  /** Release the reader lock after consumption. */
  releaseLock: () => void
}

/**
 * Minimal structural view of `response.body`, narrowed to the method we call on it. This
 * avoids referencing the global `ReadableStream` type directly.
 */
interface ByteStreamSource {
  /** Acquire a reader over the underlying stream. */
  getReader: () => ByteStreamReader
}

/**
 * Read a response body into a `Buffer`, rejecting payloads larger than `maxBytes`.
 *
 * The reader performs a `Content-Length` pre-check before streaming, and a running-total
 * check during streaming to catch misreporting servers and chunked responses. On overflow
 * the underlying stream is cancelled so the socket is released.
 *
 * @param response Response produced by the shared `impit` client.
 * @param maxBytes Hard upper bound on the accumulated payload, in bytes.
 * @param url Target URL used when composing the `FetchError` for diagnostics.
 * @returns The fully received payload as a `Buffer`.
 * @throws {FetchError} When the body length exceeds `maxBytes`.
 */
export async function readLimitedBytes(response: ImpitResponse, maxBytes: number, url: string): Promise<Buffer> {
  assertContentLengthWithinLimit(response, maxBytes, url)

  const body = response.body as unknown as ByteStreamSource | null | undefined

  if (body === null || body === undefined) {
    const bytes = await response.bytes()

    if (bytes.length > maxBytes) {
      throw buildOverflowError(maxBytes, url)
    }

    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  const reader = body.getReader()

  try {
    const [chunks, total] = await drainReader(reader, maxBytes, url, [], 0)

    return Buffer.concat(chunks, total)
  } finally {
    reader.releaseLock()
  }
}

/**
 * Read a response body as a decoded string, rejecting payloads larger than `maxBytes`.
 *
 * Decoding uses the `charset` parameter of the response's `content-type` header when present,
 * otherwise UTF-8. Unknown charset labels are quietly downgraded to UTF-8 so servers advertising
 * exotic encodings cannot wedge the tool.
 *
 * @param response Response produced by the shared `impit` client.
 * @param maxBytes Hard upper bound on the accumulated payload, in bytes.
 * @param url Target URL used when composing the `FetchError` for diagnostics.
 * @returns The decoded body as a string.
 * @throws {FetchError} When the body length exceeds `maxBytes`.
 */
export async function readLimitedText(response: ImpitResponse, maxBytes: number, url: string): Promise<string> {
  const buffer = await readLimitedBytes(response, maxBytes, url)
  const charset = extractCharset(response.headers.get("content-type"))

  return decodeWithFallback(buffer, charset)
}

/**
 * Recursively consume the reader, accumulating chunks and enforcing the byte ceiling on each
 * read. A recursive tail call is used in preference to a `while` loop so the eslint
 * `no-await-in-loop` rule does not need to be suppressed — each chunk await lives in its own
 * function activation.
 *
 * @param reader Underlying byte-stream reader.
 * @param maxBytes Hard upper bound on the accumulated payload, in bytes.
 * @param url Target URL used when composing the `FetchError` for diagnostics.
 * @param chunks Chunks accumulated so far.
 * @param total Total byte count across `chunks`.
 * @returns A tuple of the final chunk list and total byte count.
 * @throws {FetchError} When the body length exceeds `maxBytes`.
 */
async function drainReader(
  reader: ByteStreamReader,
  maxBytes: number,
  url: string,
  chunks: Uint8Array[],
  total: number
): Promise<[Uint8Array[], number]> {
  const { done, value } = await reader.read()

  if (done) {
    return [chunks, total]
  }

  if (value === undefined) {
    return drainReader(reader, maxBytes, url, chunks, total)
  }

  const nextTotal = total + value.byteLength

  if (nextTotal > maxBytes) {
    await reader.cancel()
    throw buildOverflowError(maxBytes, url)
  }

  chunks.push(value)

  return drainReader(reader, maxBytes, url, chunks, nextTotal)
}

/**
 * Throw a `FetchError` when the response's `Content-Length` header advertises a payload
 * larger than `maxBytes`. A missing or malformed header is treated as unknown and allowed
 * through to the streaming check.
 *
 * @param response Response whose headers should be inspected.
 * @param maxBytes Hard upper bound on the accumulated payload, in bytes.
 * @param url Target URL used when composing the `FetchError` for diagnostics.
 * @throws {FetchError} When the declared content length exceeds `maxBytes`.
 */
function assertContentLengthWithinLimit(response: ImpitResponse, maxBytes: number, url: string): void {
  const headerValue = response.headers.get("content-length")

  if (headerValue === null) {
    return
  }

  const declared = Number.parseInt(headerValue, 10)

  if (!Number.isFinite(declared)) {
    return
  }

  if (declared > maxBytes) {
    throw buildOverflowError(maxBytes, url)
  }
}

/**
 * Construct the overflow error with the configured limit rendered as megabytes.
 *
 * @param maxBytes Hard upper bound on the accumulated payload, in bytes.
 * @param url Target URL carried on the resulting error for diagnostics.
 * @returns A `FetchError` describing the overflow.
 */
function buildOverflowError(maxBytes: number, url: string): FetchError {
  const mb = (maxBytes / BYTES_PER_MB).toFixed(MB_MESSAGE_FRACTION_DIGITS)

  return new FetchError(`Response exceeds ${mb} MB`, undefined, url)
}

/**
 * Parse the `charset` parameter from a `content-type` header value, case-insensitively.
 *
 * @param contentType Raw header value, or `null` when absent.
 * @returns The declared charset, or `undefined` when no charset is present.
 */
function extractCharset(contentType: string | null): string | undefined {
  if (contentType === null) {
    return undefined
  }

  const match = /charset\s*=\s*"?([^";]+)"?/i.exec(contentType)

  return match?.[1]?.trim()
}

/**
 * Decode a buffer using the requested charset, falling back to UTF-8 when the label is
 * missing, empty, or unknown to `TextDecoder`.
 *
 * @param buffer Bytes to decode.
 * @param charset Declared charset, or `undefined` when the response did not specify one.
 * @returns The decoded string.
 */
function decodeWithFallback(buffer: Buffer, charset: string | undefined): string {
  const label = charset === undefined || charset === "" ? DEFAULT_CHARSET : charset

  try {
    return new TextDecoder(label).decode(buffer)
  } catch {
    return new TextDecoder(DEFAULT_CHARSET).decode(buffer)
  }
}
