/**
 * Translate the Rust `Debug` repr that `impit` surfaces from `reqwest`/`hyper` transport
 * failures into a short, human-readable summary. Returns `undefined` when no rule matches
 * so callers can fall back to the original message and preserve diagnostic detail.
 */

import { errorMessage } from "../errors"

/**
 * Prefix `impit` prepends to the underlying `reqwest::Error` debug repr.
 */
const IMPIT_PREFIX = "The internal HTTP library has thrown an error: "

/**
 * Single rule mapping a regex over the inner debug repr to a clean summary string.
 */
interface SummaryRule {
  /** Pattern matched against the unwrapped impit message. */
  pattern: RegExp

  /** Replacement summary returned when the pattern matches. */
  summary: string

  /**
   * Optional retry-eligibility hint for the rule. Deterministic failures such as a malformed
   * server response set `false` so the retry predicate skips them. Unset rules defer to the
   * default status-code-based predicate in `isRetryableFetchError`.
   */
  retryable?: boolean
}

/**
 * Translation result returned to the caller, carrying the user-facing summary and the
 * retry-eligibility hint from the matched rule. Structurally a subset of `SummaryRule`.
 */
export type TranslatedImpitError = Pick<SummaryRule, "summary" | "retryable">

/**
 * Pattern → summary mappings checked in order. The first match wins, so list more specific
 * patterns before broader fallbacks. Rules whose match indicates a malformed server response
 * are flagged `retryable: false` so the retry predicate skips them.
 */
const SUMMARY_RULES: readonly SummaryRule[] = [
  {
    pattern: /Parse\(\s*Header\(\s*Token/,
    summary: "server returned a malformed HTTP header (invalid name)",
    retryable: false,
  },
  {
    pattern: /Parse\(\s*Header\(\s*Value/,
    summary: "server returned a malformed HTTP header (invalid value)",
    retryable: false,
  },
  { pattern: /Parse\(\s*Header\b/, summary: "server returned a malformed HTTP header", retryable: false },
  { pattern: /Parse\(\s*Status/, summary: "server returned a malformed HTTP status line", retryable: false },
  { pattern: /Parse\(\s*Version/, summary: "server returned an unsupported HTTP version", retryable: false },
  {
    pattern: /IncompleteMessage|ChannelClosed|Canceled/,
    summary: "server closed the connection before the response completed",
  },
  { pattern: /failed to lookup address|dns error/i, summary: "could not resolve hostname" },
  { pattern: /connection refused/i, summary: "connection refused" },
  { pattern: /tcp connect|ConnectError/, summary: "could not connect to server" },
  { pattern: /timed out|deadline has elapsed/i, summary: "request timed out" },
  { pattern: /tls|certificate|handshake/i, summary: "TLS handshake failed" },
]

/**
 * Translate the Rust debug repr that `impit` surfaces from a transport failure into a
 * concise human-readable summary plus an optional retry-eligibility hint.
 *
 * @param error - Thrown value caught from a call into the `impit` client.
 * @returns Translation result, or `undefined` when no rule matched.
 */
export function translateImpitError(error: unknown): TranslatedImpitError | undefined {
  const raw = errorMessage(error)
  const inner = raw.startsWith(IMPIT_PREFIX) ? raw.slice(IMPIT_PREFIX.length) : raw

  return SUMMARY_RULES.find(rule => rule.pattern.test(inner))
}
