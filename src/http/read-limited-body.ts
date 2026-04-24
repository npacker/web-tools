/**
 * Bounded response-body reader that rejects payloads exceeding a byte ceiling.
 */

import { Readable } from "node:stream"

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
    return await getRawBody(toNodeReadable(response), { limit: maxBytes })
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
