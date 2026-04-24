/**
 * Charset-aware byte-to-string decoding shared by bounded readers that need to decode after
 * the body has been buffered, rather than at read time.
 */

import { decode as iconvDecode, encodingExists } from "iconv-lite"

import { parseContentTypeSafe } from "./parse-content-type"

/**
 * Default character set applied when the response omits `charset` or advertises an
 * encoding that `iconv-lite` does not recognise.
 *
 * @const {string}
 * @default
 */
const DEFAULT_CHARSET = "utf8"

/**
 * Decode a response body buffer to a string, honouring the `charset` advertised on the
 * `content-type` header when `iconv-lite` recognises the label. Falls back to UTF-8 so
 * exotic or missing encodings cannot wedge the caller.
 *
 * @param buffer Raw response bytes.
 * @param contentType Raw `content-type` header value, or `null` when absent.
 * @returns The decoded body as a string.
 */
export function decodeBytes(buffer: Buffer, contentType: string | null): string {
  return iconvDecode(buffer, resolveEncoding(contentType))
}

/**
 * Resolve the charset for text decoding, falling back to UTF-8 when the declared
 * charset is missing or not recognised by `iconv-lite`.
 *
 * @param contentType Raw `content-type` header value, or `null` when absent.
 * @returns A charset label accepted by `iconv-lite`.
 */
function resolveEncoding(contentType: string | null): string {
  const charset = parseContentTypeSafe(contentType)?.parameters.charset

  if (charset === undefined) {
    return DEFAULT_CHARSET
  }

  return encodingExists(charset) ? charset : DEFAULT_CHARSET
}
