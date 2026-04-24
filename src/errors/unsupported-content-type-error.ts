/**
 * Error raised when a fetched page's content type is outside the supported whitelist.
 */

/**
 * Raised when Visit Website fetches a URL whose declared or sniffed content type cannot be
 * rendered into readable text by any of the per-kind handlers.
 */
export class UnsupportedContentTypeError extends Error {
  /**
   * Create an unsupported-content-type error carrying the offending MIME type and URL.
   *
   * @param mimeType The MIME type that was detected on the response.
   * @param url Optional URL that produced the unsupported response.
   */
  public constructor(
    public readonly mimeType: string,
    public readonly url?: string
  ) {
    super(`Unsupported content type: ${mimeType}`)
    this.name = "UnsupportedContentTypeError"
  }
}
