/**
 * User-facing error formatting for tool invocations.
 */

import { FetchError, NoResultsError, SearchAbortedError, VqdTokenError, errorMessage, isAbortError } from "../errors"

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
type ToolErrorKind = "search" | "website" | "image-download"

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
 */
const TOOL_ERROR_TEMPLATES: Record<ToolErrorKind, ToolErrorTemplates> = {
  search: {
    aborted: "Search aborted by user.",
    fetchPrefix: "Failed to fetch search results",
    unexpectedPrefix: "Error during search",
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

  if (isAbortError(error) || error instanceof SearchAbortedError) {
    return templates.aborted
  }

  if (error instanceof NoResultsError) {
    return error.message
  }

  if (error instanceof VqdTokenError) {
    return `Error: ${error.message}`
  }

  if (error instanceof FetchError) {
    context.warn(`${templates.fetchPrefix}: ${error.message}`)

    return `Error: ${templates.fetchPrefix}: ${error.message}`
  }

  const message = errorMessage(error)
  context.warn(`${templates.unexpectedPrefix}: ${message}`)

  return `Error: ${message}`
}
