/**
 * Application-wide constants
 */

// Cache configuration
export const SEARCH_CACHE_TTL_MS = 15 * 60_000 // 15 minutes
export const SEARCH_CACHE_MAX_SIZE = 100
export const VQD_CACHE_TTL_MS = 10 * 60_000 // 10 minutes
export const VQD_CACHE_MAX_SIZE = 50

// Rate limiting
export const MIN_REQUEST_INTERVAL_MS = 5_000 // 5 seconds between requests
export const IMAGE_FETCH_DELAY_MS = 2_000 // 2 seconds delay after VQD token fetch

// Image download
export const IMAGE_DOWNLOAD_TIMEOUT_MS = 10_000 // 10 seconds timeout

// Pagination
export const MIN_PAGE_SIZE = 1
export const MAX_PAGE_SIZE = 10
export const DEFAULT_PAGE_SIZE = 5
export const MIN_PAGE_NUMBER = 1
export const MAX_PAGE_NUMBER = 100
export const DEFAULT_PAGE_NUMBER = 1

// Safe search
export const DEFAULT_SAFE_SEARCH = "moderate" as const

// DuckDuckGo API
export const DUCKDUCKGO_BASE_URL = "https://duckduckgo.com"
export const WEB_SEARCH_PATH = "/html/"
export const IMAGE_SEARCH_PATH = "/i.js"
export const VQD_FETCH_PATH = "/"

// HTML selectors
export const RESULT_LINK_SELECTOR = ".result__a"
export const VQD_INPUT_SELECTOR = 'input[name="vqd"]'

// File extensions
export const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"] as const

// Error messages
export const ERROR_MESSAGES = {
  SEARCH_ABORTED: "Search aborted by user.",
  NO_WEB_RESULTS: "No web pages found for the query.",
  NO_IMAGE_RESULTS: "No images found for the query.",
  VQD_TOKEN_FAILED: "Unable to extract vqd token.",
  IMAGE_FETCH_FAILED: "Error fetching images",
} as const

// Config field values
export const AUTO_CONFIG_VALUE = "auto" as const
export const ZERO_PAGE_SIZE_VALUE = 0 as const
