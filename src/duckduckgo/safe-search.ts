/**
 * Safe-search modes accepted by the DuckDuckGo endpoints.
 *
 * The encoding to the DDG-specific `p` query parameter lives in
 * `encodeSafeSearchParameter` inside `build-urls.ts`.
 */
export type SafeSearch = "strict" | "moderate" | "off"
