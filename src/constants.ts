/**
 * Application-wide constants.
 */

/**
 * Time-to-live for cached web search results, in milliseconds.
 */
export const SEARCH_CACHE_TTL_MS = 15 * 60_000

/**
 * Maximum number of search result entries retained in the search cache.
 */
export const SEARCH_CACHE_MAX_SIZE = 100

/**
 * Time-to-live for cached VQD tokens, in milliseconds.
 */
export const VQD_CACHE_TTL_MS = 10 * 60_000

/**
 * Maximum number of VQD tokens retained in the VQD cache.
 */
export const VQD_CACHE_MAX_SIZE = 50

/**
 * Minimum interval enforced between outbound DuckDuckGo requests, in milliseconds.
 */
export const MIN_REQUEST_INTERVAL_MS = 5000

/**
 * Delay inserted between a VQD token fetch and the subsequent image search, in milliseconds.
 */
export const IMAGE_FETCH_DELAY_MS = 2000

/**
 * Timeout applied to each image download, in milliseconds.
 */
export const IMAGE_DOWNLOAD_TIMEOUT_MS = 10_000

/**
 * Lower bound on the configurable page size.
 */
export const MIN_PAGE_SIZE = 1

/**
 * Upper bound on the configurable page size.
 */
export const MAX_PAGE_SIZE = 10

/**
 * Default page size when no plugin or override value is provided.
 */
export const DEFAULT_PAGE_SIZE = 5

/**
 * Lower bound on the requested page number.
 */
export const MIN_PAGE_NUMBER = 1

/**
 * Upper bound on the requested page number.
 */
export const MAX_PAGE_NUMBER = 100

/**
 * Default page number when no value is provided.
 */
export const DEFAULT_PAGE_NUMBER = 1

/**
 * Default safe-search mode when neither plugin nor override supplies a value.
 */
export const DEFAULT_SAFE_SEARCH = "moderate" as const

/**
 * Base URL used for all DuckDuckGo requests.
 */
export const DUCKDUCKGO_BASE_URL = "https://duckduckgo.com"

/**
 * Path of the DuckDuckGo HTML web search endpoint.
 */
export const WEB_SEARCH_PATH = "/html/"

/**
 * Path of the DuckDuckGo JSON image search endpoint.
 */
export const IMAGE_SEARCH_PATH = "/i.js"

/**
 * Path of the DuckDuckGo homepage used to scrape VQD tokens.
 */
export const VQD_FETCH_PATH = "/"

/**
 * CSS selector matching web search result links.
 */
export const RESULT_LINK_SELECTOR = ".result__a"

/**
 * CSS selector matching the VQD token input element.
 */
export const VQD_INPUT_SELECTOR = 'input[name="vqd"]'

/**
 * Image file extensions recognized as supported download targets.
 */
export const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"] as const

/**
 * User-facing error messages surfaced by the plugin.
 */
export const ERROR_MESSAGES = {
  SEARCH_ABORTED: "Search aborted by user.",
  NO_WEB_RESULTS: "No web pages found for the query.",
  NO_IMAGE_RESULTS: "No images found for the query.",
  VQD_TOKEN_FAILED: "Unable to extract vqd token.",
  IMAGE_FETCH_FAILED: "Error fetching images",
} as const

/**
 * Sentinel value indicating that a configuration field should use its automatic default.
 */
export const AUTO_CONFIG_VALUE = "auto" as const

/**
 * Sentinel page-size value indicating that the page size should be auto-resolved.
 */
export const ZERO_PAGE_SIZE_VALUE = 0 as const
