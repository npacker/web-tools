/**
 * Type definitions for the DuckDuckGo plugin.
 */

import { AUTO_CONFIG_VALUE } from "./constants"

/** Safe-search modes accepted by the DuckDuckGo endpoints. */
export type SafeSearch = "strict" | "moderate" | "off"
/**
 * A single web search result returned to the caller.
 */
export interface SearchResult {
  /** Human-readable title of the result link. */
  label: string
  /** Destination URL of the result link. */
  url: string
}
/**
 * Cached payload for a web search, holding the parsed results and their count.
 */
export interface SearchCacheEntry {
  /** Parsed search results. */
  results: SearchResult[]
  /** Number of results in `results`. */
  count: number
}
/**
 * Raw image result entry as returned by the DuckDuckGo image endpoint.
 */
export interface DuckDuckGoImageResult {
  /** Remote URL of the full-resolution image. */
  image: string
}
/**
 * An image search result returned to the caller.
 */
export interface ImageSearchResult {
  /** Original remote URL of the image. */
  url: string
  /** Local filesystem path when the image was successfully downloaded. */
  localPath?: string
}
/**
 * Input parameters shared by web and image search requests.
 */
export interface SearchParameters {
  /** Raw search query string. */
  query: string
  /** Number of results requested per page. */
  pageSize: number
  /** Safe-search mode applied to the request. */
  safeSearch: SafeSearch
  /** One-based page number of the request. */
  page: number
}
/**
 * Shape of the persisted plugin configuration values.
 */
export interface ConfigValue {
  /** Configured page size, or `null` when unset. */
  pageSize: number | null
  /** Configured safe-search mode, or the auto sentinel when unset. */
  safeSearch: SafeSearch | typeof AUTO_CONFIG_VALUE
}
/**
 * Auto configuration value literal type.
 */
export type AutoConfigValue = typeof AUTO_CONFIG_VALUE
