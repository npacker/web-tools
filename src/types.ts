/**
 * Type definitions for the DuckDuckGo plugin
 */

import { AUTO_CONFIG_VALUE } from "./constants"

export type SafeSearch = "strict" | "moderate" | "off"

export interface SearchResult {
  label: string
  url: string
}

export interface SearchCacheEntry {
  results: SearchResult[]
  count: number
}

export interface DuckDuckGoImageResult {
  image: string
}

export interface ImageSearchResult {
  url: string
  localPath?: string
}

export interface SearchParameters {
  query: string
  pageSize: number
  safeSearch: SafeSearch
  page: number
}

export interface ConfigValue {
  pageSize: number | null
  safeSearch: SafeSearch | typeof AUTO_CONFIG_VALUE
}

/**
 * Auto configuration value literal type
 */
export type AutoConfigValue = typeof AUTO_CONFIG_VALUE
