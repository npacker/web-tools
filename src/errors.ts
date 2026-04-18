/**
 * Error handling utilities
 */

export class DuckDuckGoError extends Error {
  public constructor(
    message: string,
    public readonly code: string
  ) {
    super(message)
    this.name = "DuckDuckGoError"
  }
}

export class SearchAbortedError extends DuckDuckGoError {
  public constructor() {
    super("Search aborted by user.", "SEARCH_ABORTED")
    this.name = "SearchAbortedError"
  }
}

export class NoResultsError extends DuckDuckGoError {
  public constructor(public readonly type: "web" | "image") {
    const message = type === "web" ? "No web pages found for the query." : "No images found for the query."
    super(message, "NO_RESULTS")
    this.name = "NoResultsError"
  }
}

export class VqdTokenError extends DuckDuckGoError {
  public constructor() {
    super("Unable to extract vqd token.", "VQD_TOKEN_FAILED")
    this.name = "VqdTokenError"
  }
}

export class FetchError extends DuckDuckGoError {
  public constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message, "FETCH_ERROR")
    this.name = "FetchError"
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
