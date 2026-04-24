/**
 * Configuration resolution utilities.
 */

import { AUTO_CONFIG_VALUE } from "./auto-sentinel"
import { configSchematics } from "./config-schematics"

import type { SafeSearch } from "../duckduckgo/safe-search"
import type { RetryOptions } from "../http/retry"
import type { ToolsProviderController } from "@lmstudio/sdk"

/**
 * Web-search page stride used when the results cap is disabled. Matches the ~30 results
 * DuckDuckGo's HTML endpoint returns per page, so the `s=` offset advances one DDG page
 * at a time rather than re-fetching overlapping windows.
 *
 * @const {number}
 * @default
 */
const WEB_NATIVE_PAGE_SIZE = 30

/**
 * Image-search page stride used when the results cap is disabled. Matches the ~100 results
 * DuckDuckGo's image JSON endpoint returns per page.
 *
 * @const {number}
 * @default
 */
const IMAGE_NATIVE_PAGE_SIZE = 100

/**
 * Fallback cap used when a results-per-page field reads `null` before the UI has committed the
 * schematic default.
 *
 * @const {number}
 * @default
 */
const DEFAULT_MAX_RESULTS = 10

/**
 * Default safe-search mode when neither plugin nor override supplies a value.
 *
 * @const {"moderate"}
 * @default
 */
const DEFAULT_SAFE_SEARCH = "moderate" as const

/**
 * Default number of images scraped by the View Images tool when no value is provided.
 *
 * @const {number}
 * @default
 */
const DEFAULT_MAX_IMAGES = 10

/**
 * Default visible-text character budget for the Visit Website tool when no value is provided.
 *
 * @const {number}
 * @default
 */
const DEFAULT_CONTENT_LIMIT = 10_000

/**
 * Default output format for the Visit Website tool's `content` field when no value is provided.
 *
 * @const {ContentFormat}
 * @default
 */
const DEFAULT_CONTENT_FORMAT = "markdown" as const

/**
 * Default for whether web search results should include preview snippets.
 *
 * @const {boolean}
 * @default
 */
const DEFAULT_INCLUDE_SNIPPETS = true

/**
 * Default TTL for the web/image search result cache, in seconds.
 *
 * @const {number}
 * @default
 */
const DEFAULT_SEARCH_CACHE_TTL_SECONDS = 15 * 60

/**
 * Default TTL for the image search token cache, in seconds.
 *
 * @const {number}
 * @default
 */
const DEFAULT_IMAGE_SEARCH_TOKEN_CACHE_TTL_SECONDS = 10 * 60

/**
 * Default TTL for the website HTML cache, in seconds.
 *
 * @const {number}
 * @default
 */
const DEFAULT_WEBSITE_CACHE_TTL_SECONDS = 10 * 60

/**
 * Default minimum interval enforced between outbound requests, in seconds.
 *
 * @const {number}
 * @default
 */
const DEFAULT_REQUEST_INTERVAL_SECONDS = 5

/**
 * Default delay inserted before the image search API call, in seconds.
 *
 * @const {number}
 * @default
 */
const DEFAULT_IMAGE_SEARCH_REQUEST_DELAY_SECONDS = 2

/**
 * Default number of retry attempts, including the first try, applied to every outbound request.
 *
 * @const {number}
 * @default
 */
const DEFAULT_MAX_RETRIES = 3

/**
 * Default base backoff before the first retry, in seconds.
 *
 * @const {number}
 * @default
 */
const DEFAULT_RETRY_INITIAL_BACKOFF_SECONDS = 1

/**
 * Default cap on a single retry backoff delay after exponential growth, in seconds.
 *
 * @const {number}
 * @default
 */
const DEFAULT_RETRY_MAX_BACKOFF_SECONDS = 30

/**
 * Default upper bound on the HTML payload fetched by Visit Website, in megabytes.
 *
 * @const {number}
 * @default
 */
const DEFAULT_MAX_RESPONSE_MB = 5

/**
 * Default upper bound on the per-image payload downloaded by Image Search and View Images, in megabytes.
 *
 * @const {number}
 * @default
 */
const DEFAULT_MAX_IMAGE_MB = 10

/**
 * Conversion factor from seconds to milliseconds.
 *
 * @const {number}
 * @default
 */
const MS_PER_SECOND = 1000

/**
 * Conversion factor from megabytes to bytes.
 *
 * @const {number}
 * @default
 */
const BYTES_PER_MB = 1024 * 1024

/**
 * Output format for the Visit Website tool's `content` field.
 */
export type ContentFormat = "markdown" | "text"

/**
 * Fully resolved configuration used by a tool invocation.
 */
interface ResolvedConfig {
  /** Upper bound on web-search results returned per page; `Infinity` when the cap is disabled. */
  webMaxResults: number
  /** Stride used to compute the `s=` offset for web-search pagination. */
  webPageStride: number
  /** Upper bound on image-search results returned per page; `Infinity` when the cap is disabled. */
  imageMaxResults: number
  /** Stride used to compute the `s=` offset for image-search pagination. */
  imagePageStride: number
  /** Safe-search mode to apply to the request. */
  safeSearch: SafeSearch
  /** Whether web search results should include preview snippets. */
  includeSnippets: boolean
  /** Maximum number of images scraped by the View Images tool. */
  maxImages: number
  /** Visible-text character budget for the Visit Website tool. */
  contentLimit: number
  /** Output format for the Visit Website tool's `content` field. */
  contentFormat: ContentFormat
  /** Delay before the image search API call, in milliseconds. */
  imageSearchRequestDelayMs: number
  /** Hard upper bound on the HTML payload fetched by Visit Website, in bytes. */
  maxResponseBytes: number
  /** Hard upper bound on the per-image payload downloaded by Image Search and View Images, in bytes. */
  maxImageBytes: number
}

/**
 * Timing configuration captured once at tools-provider initialization.
 */
export interface ResolvedTimingConfig {
  /** TTL for the search result cache, in milliseconds. */
  searchCacheTtlMs: number
  /** TTL for the image search token cache, in milliseconds. */
  imageSearchTokenCacheTtlMs: number
  /** TTL for the website HTML cache, in milliseconds. */
  websiteCacheTtlMs: number
  /** Minimum interval between outbound requests, in milliseconds. */
  requestIntervalMs: number
  /** Retry policy applied to every outbound request. */
  retryPolicy: RetryOptions
}

/**
 * Optional per-invocation overrides applied on top of plugin configuration.
 */
interface ConfigOverrides {
  /** Max-images override provided by the caller. */
  maxImages?: number
}

/**
 * Resolves configuration by merging plugin config with runtime overrides.
 * Priority: plugin config > runtime override > default.
 *
 * @param ctl Tools provider controller exposing plugin configuration.
 * @param overrides Per-call overrides supplied by the tool invocation.
 * @returns The fully resolved configuration used to drive a request.
 */
export function resolveConfig(ctl: ToolsProviderController, overrides: ConfigOverrides = {}): ResolvedConfig {
  const pluginConfig = ctl.getPluginConfig(configSchematics)
  const pluginLimitWeb = pluginConfig.get("limitWebResults") as boolean | null
  const pluginWebMax = pluginConfig.get("webMaxResults") as number | null
  const pluginLimitImage = pluginConfig.get("limitImageResults") as boolean | null
  const pluginImageMax = pluginConfig.get("imageMaxResults") as number | null
  const pluginSafeSearch = pluginConfig.get("safeSearch") as SafeSearch | typeof AUTO_CONFIG_VALUE
  const pluginIncludeSnippets = pluginConfig.get("includeSnippets") as boolean | null
  const pluginMaxImages = pluginConfig.get("maxImages") as number | null
  const pluginContentLimit = pluginConfig.get("contentLimit") as number | null
  const pluginContentFormat = pluginConfig.get("contentFormat") as ContentFormat | null
  const pluginImageSearchRequestDelaySeconds = pluginConfig.get("imageSearchRequestDelaySeconds") as number | null
  const pluginMaxResponseMb = pluginConfig.get("maxResponseMb") as number | null
  const pluginMaxImageMb = pluginConfig.get("maxImageMb") as number | null
  const webLimited = pluginLimitWeb ?? true
  const imageLimited = pluginLimitImage ?? true

  return {
    webMaxResults: webLimited ? (pluginWebMax ?? DEFAULT_MAX_RESULTS) : Number.POSITIVE_INFINITY,
    webPageStride: webLimited ? (pluginWebMax ?? DEFAULT_MAX_RESULTS) : WEB_NATIVE_PAGE_SIZE,
    imageMaxResults: imageLimited ? (pluginImageMax ?? DEFAULT_MAX_RESULTS) : Number.POSITIVE_INFINITY,
    imagePageStride: imageLimited ? (pluginImageMax ?? DEFAULT_MAX_RESULTS) : IMAGE_NATIVE_PAGE_SIZE,
    safeSearch: resolveSafeSearch(pluginSafeSearch),
    includeSnippets: pluginIncludeSnippets ?? DEFAULT_INCLUDE_SNIPPETS,
    maxImages: pluginMaxImages ?? overrides.maxImages ?? DEFAULT_MAX_IMAGES,
    contentLimit: pluginContentLimit ?? DEFAULT_CONTENT_LIMIT,
    contentFormat: pluginContentFormat ?? DEFAULT_CONTENT_FORMAT,
    imageSearchRequestDelayMs:
      (pluginImageSearchRequestDelaySeconds ?? DEFAULT_IMAGE_SEARCH_REQUEST_DELAY_SECONDS) * MS_PER_SECOND,
    maxResponseBytes: (pluginMaxResponseMb ?? DEFAULT_MAX_RESPONSE_MB) * BYTES_PER_MB,
    maxImageBytes: (pluginMaxImageMb ?? DEFAULT_MAX_IMAGE_MB) * BYTES_PER_MB,
  }
}

/**
 * Resolves timing configuration once at tools-provider initialization.
 * Values feed into cache construction and the shared rate limiter, so they are
 * fixed for the lifetime of the session and require a plugin reload to change.
 *
 * @param ctl Tools provider controller exposing plugin configuration.
 * @returns Timing values in milliseconds.
 */
export function resolveTimingConfig(ctl: ToolsProviderController): ResolvedTimingConfig {
  const pluginConfig = ctl.getPluginConfig(configSchematics)
  const searchTtlSeconds = pluginConfig.get("searchCacheTtlSeconds") as number | null
  const tokenTtlSeconds = pluginConfig.get("imageSearchTokenCacheTtlSeconds") as number | null
  const websiteTtlSeconds = pluginConfig.get("websiteCacheTtlSeconds") as number | null
  const intervalSeconds = pluginConfig.get("requestIntervalSeconds") as number | null
  const maxRetries = pluginConfig.get("maxRetries") as number | null
  const retryInitialSeconds = pluginConfig.get("retryInitialBackoffSeconds") as number | null
  const retryMaxSeconds = pluginConfig.get("retryMaxBackoffSeconds") as number | null

  return {
    searchCacheTtlMs: (searchTtlSeconds ?? DEFAULT_SEARCH_CACHE_TTL_SECONDS) * MS_PER_SECOND,
    imageSearchTokenCacheTtlMs: (tokenTtlSeconds ?? DEFAULT_IMAGE_SEARCH_TOKEN_CACHE_TTL_SECONDS) * MS_PER_SECOND,
    websiteCacheTtlMs: (websiteTtlSeconds ?? DEFAULT_WEBSITE_CACHE_TTL_SECONDS) * MS_PER_SECOND,
    requestIntervalMs: (intervalSeconds ?? DEFAULT_REQUEST_INTERVAL_SECONDS) * MS_PER_SECOND,
    retryPolicy: {
      retries: maxRetries ?? DEFAULT_MAX_RETRIES,
      factor: 2,
      minTimeout: (retryInitialSeconds ?? DEFAULT_RETRY_INITIAL_BACKOFF_SECONDS) * MS_PER_SECOND,
      maxTimeout: (retryMaxSeconds ?? DEFAULT_RETRY_MAX_BACKOFF_SECONDS) * MS_PER_SECOND,
      randomize: true,
    },
  }
}

/**
 * Resolves safe search from plugin configuration.
 *
 * @param pluginValue Value read from plugin configuration, possibly the auto sentinel.
 * @returns The effective safe-search mode.
 */
function resolveSafeSearch(pluginValue: SafeSearch | typeof AUTO_CONFIG_VALUE): SafeSearch {
  return pluginValue === AUTO_CONFIG_VALUE ? DEFAULT_SAFE_SEARCH : pluginValue
}
