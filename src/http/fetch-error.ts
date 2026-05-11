/**
 * HTTP error raised when an outbound request fails or returns a non-success status.
 */

/**
 * Optional fields layered onto the standard `ErrorOptions` for `FetchError`.
 */
interface FetchErrorOptions extends ErrorOptions {
  /** Explicit retry-eligibility override; `false` skips the retry predicate, unset uses status-code defaults. */
  retryable?: boolean
}

/**
 * Raised when an HTTP request fails or returns a non-success status.
 */
export class FetchError extends Error {
  /**
   * Explicit retry-eligibility override; `undefined` falls through to the status-code defaults
   * in `isRetryableFetchError`.
   */
  public readonly retryable?: boolean

  /**
   * Create a fetch error carrying an optional HTTP status code, URL, and underlying cause.
   *
   * @param message - Human-readable error description.
   * @param statusCode - Optional HTTP status code associated with the failure.
   * @param url - Optional URL that failed to fetch.
   * @param options - Optional error options.
   */
  public constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly url?: string,
    options?: FetchErrorOptions
  ) {
    super(message, options)
    this.name = "FetchError"
    this.retryable = options?.retryable
  }
}
