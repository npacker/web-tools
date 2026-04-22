/**
 * VQD token error raised when the token cannot be obtained from DuckDuckGo.
 */

/**
 * Possible reasons why VQD token acquisition failed.
 */
export type VqdTokenFailureReason = "element_missing" | "value_empty" | "fetch_failed"

/**
 * Raised when the VQD token required for image search cannot be obtained.
 */
export class VqdTokenError extends Error {
  /**
   * Create a VQD extraction error with a reason-derived message, optionally chaining a cause.
   *
   * @param reason Optional machine-readable reason for the failure.
   * @param options Optional error options.
   * @param options.cause Optional underlying error to chain for diagnostics.
   */
  public constructor(
    public readonly reason?: VqdTokenFailureReason,
    options?: ErrorOptions
  ) {
    const message = reason ? `Unable to obtain VQD token: ${formatVqdReason(reason)}.` : "Unable to obtain VQD token."
    super(message, options)
    this.name = "VqdTokenError"
  }
}

/**
 * Convert a machine-readable VQD failure reason to a human-friendly phrase.
 *
 * @param reason Machine-readable failure reason.
 * @returns Human-readable explanation of what went wrong.
 */
function formatVqdReason(reason: VqdTokenFailureReason): string {
  switch (reason) {
    case "element_missing": {
      return "the search form input element was not found on the DuckDuckGo homepage"
    }

    case "value_empty": {
      return "the input element's value attribute was empty or missing"
    }

    case "fetch_failed": {
      return "the request to the DuckDuckGo homepage failed"
    }
  }
}
