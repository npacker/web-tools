/**
 * HTTP error raised when an outbound request fails or returns a non-success status.
 */

/**
 * Raised when an HTTP request fails or returns a non-success status.
 */
export class FetchError extends Error {
  /**
   * Create a fetch error carrying an optional HTTP status code, URL, and underlying cause.
   *
   * @param message Human-readable error description.
   * @param statusCode Optional HTTP status code associated with the failure.
   * @param url Optional URL that failed to fetch.
   * @param options Optional error options.
   * @param options.cause Optional underlying error to chain for diagnostics.
   */
  public constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly url?: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = "FetchError"
  }
}
