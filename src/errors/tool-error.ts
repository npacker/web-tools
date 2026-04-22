/**
 * User-facing error formatting for tool invocations.
 */

import { VqdTokenError } from "../duckduckgo/vqd-token-error"
import { FetchError } from "../http/fetch-error"

import { NoResultsError } from "./no-results-error"

/**
 * Minimal context surface required by the tool-error formatter for warning output.
 */
interface ToolErrorContext {
  /** Logger used to surface non-fatal failures. */
  warn: (message: string) => void
}

/**
 * Kinds of tool flows supported by `formatToolError`, used to tailor user-facing messages.
 */
type ToolErrorKind = "web-search" | "image-search" | "website" | "image-download"

/**
 * Tool-kind-specific message templates used by `formatToolError`.
 */
interface ToolErrorTemplates {
  /** Message returned when the caller aborts the flow. */
  aborted: string
  /** Prefix applied to `FetchError` warning and response messages. */
  fetchPrefix: string
  /** Prefix applied to generic unexpected errors in warning output. */
  unexpectedPrefix: string
}

/**
 * Static mapping from tool kind to its user-facing message templates.
 *
 * @const {Record<ToolErrorKind, ToolErrorTemplates>}
 */
const TOOL_ERROR_TEMPLATES: Record<ToolErrorKind, ToolErrorTemplates> = {
  "web-search": {
    aborted: "Web search aborted by user.",
    fetchPrefix: "Failed to fetch web search results",
    unexpectedPrefix: "Error during web search",
  },
  "image-search": {
    aborted: "Image search aborted by user.",
    fetchPrefix: "Failed to fetch image search results",
    unexpectedPrefix: "Error during image search",
  },
  website: {
    aborted: "Website visit aborted by user.",
    fetchPrefix: "Failed to fetch website",
    unexpectedPrefix: "Error during website visit",
  },
  "image-download": {
    aborted: "Image download aborted by user.",
    fetchPrefix: "Failed to fetch image",
    unexpectedPrefix: "Error during image download",
  },
}

/**
 * Map a tool error to a user-facing string, warning on unexpected failures.
 *
 * @param error Error caught during tool execution.
 * @param context Minimal context surface used to emit warnings.
 * @param kind Tool flow the error originated from, controlling message phrasing.
 * @returns A user-facing error string.
 */
export function formatToolError(error: unknown, context: ToolErrorContext, kind: ToolErrorKind): string {
  const templates = TOOL_ERROR_TEMPLATES[kind]

  if (isAbortError(error)) {
    return templates.aborted
  }

  if (error instanceof NoResultsError) {
    return error.message
  }

  if (error instanceof VqdTokenError) {
    return `Error: ${appendCause(error.message, error.cause)}`
  }

  if (error instanceof FetchError) {
    const line = formatFetchError(error, templates.fetchPrefix)
    context.warn(line)

    return `Error: ${line}`
  }

  const message = errorMessage(error)
  context.warn(`${templates.unexpectedPrefix}: ${message}`)

  return `Error: ${message}`
}

/**
 * Render a `FetchError` into a single user-facing line built from its structured fields.
 *
 * @param error The fetch error to render.
 * @param prefix Tool-kind prefix applied to the line.
 * @returns The formatted line, including status, URL, and any cause.
 */
function formatFetchError(error: FetchError, prefix: string): string {
  const segments: string[] = [`${prefix}: ${error.message}`]

  if (error.url !== undefined) {
    segments.push(`— ${error.url}`)
  }

  return appendCause(segments.join(" "), error.cause)
}

/**
 * Append a `(cause: …)` suffix when a distinct underlying cause message is available.
 *
 * @param line Base message line.
 * @param cause Underlying error attached to the outer error, if any.
 * @returns The line with a cause suffix appended when the cause adds new information.
 */
function appendCause(line: string, cause: unknown): string {
  if (!(cause instanceof Error)) {
    return line
  }

  if (cause.message === "" || line.includes(cause.message)) {
    return line
  }

  return `${line} (cause: ${cause.message})`
}

/**
 * Determine whether a thrown value represents an abort signal firing.
 *
 * @param error Thrown value to inspect.
 * @returns `true` when the value is a DOM abort error.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

/**
 * Extract a human-readable message from an arbitrary thrown value.
 *
 * @param error Thrown value to stringify.
 * @returns The error message when the value is an `Error`, otherwise the stringified value.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  // Avoid exposing [object Object] for plain objects; attempt JSON serialization as a fallback.
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
