/**
 * Configuration resolution utilities.
 */

import { configSchematics } from "../config-schematics"

import { AUTO_CONFIG_VALUE } from "./auto-sentinel"

import type { SafeSearch } from "../duckduckgo/safe-search"
import type { ToolsProviderController } from "@lmstudio/sdk"

/**
 * Default page size when no plugin or override value is provided.
 */
export const DEFAULT_PAGE_SIZE = 5
/**
 * Default safe-search mode when neither plugin nor override supplies a value.
 */
export const DEFAULT_SAFE_SEARCH = "moderate" as const
/**
 * Default number of links extracted by the Visit Website tool when no value is provided.
 */
const DEFAULT_MAX_LINKS = 40
/**
 * Default number of images extracted by the Visit Website and View Images tools when no value is provided.
 */
const DEFAULT_MAX_IMAGES = 10
/**
 * Default visible-text character budget for the Visit Website tool when no value is provided.
 */
const DEFAULT_CONTENT_LIMIT = 2000
/**
 * Default TTL for the web/image search result cache, in milliseconds.
 */
const DEFAULT_SEARCH_CACHE_TTL_MS = 15 * 60_000
/**
 * Default TTL for the VQD token cache, in milliseconds.
 */
const DEFAULT_VQD_CACHE_TTL_MS = 10 * 60_000
/**
 * Default TTL for the website HTML cache, in milliseconds.
 */
const DEFAULT_WEBSITE_CACHE_TTL_MS = 10 * 60_000
/**
 * Default minimum interval enforced between outbound DuckDuckGo requests, in milliseconds.
 */
const DEFAULT_REQUEST_INTERVAL_MS = 5000
/**
 * Default delay inserted between the VQD-token scrape and the image-search API call, in milliseconds.
 */
const DEFAULT_VQD_IMAGE_DELAY_MS = 2000
/**
 * Conversion factor from seconds to milliseconds.
 */
const MS_PER_SECOND = 1000

/**
 * Fully resolved configuration used by a tool invocation.
 */
interface ResolvedConfig {
  /** Number of results to request per page. */
  pageSize: number
  /** Safe-search mode to apply to the request. */
  safeSearch: SafeSearch
  /** Maximum number of links returned by the Visit Website tool. */
  maxLinks: number
  /** Maximum number of images returned by the Visit Website and View Images tools. */
  maxImages: number
  /** Visible-text character budget for the Visit Website tool. */
  contentLimit: number
  /** Delay before the image-search API call, in milliseconds. */
  vqdImageDelayMs: number
}

/**
 * Timing configuration captured once at tools-provider initialization.
 */
export interface ResolvedTimingConfig {
  /** TTL for the search result cache, in milliseconds. */
  searchCacheTtlMs: number
  /** TTL for the VQD token cache, in milliseconds. */
  vqdCacheTtlMs: number
  /** TTL for the website HTML cache, in milliseconds. */
  websiteCacheTtlMs: number
  /** Minimum interval between outbound requests, in milliseconds. */
  requestIntervalMs: number
}

/**
 * Optional per-invocation overrides applied on top of plugin configuration.
 */
interface ConfigOverrides {
  /** Page size override provided by the caller. */
  pageSize?: number
  /** Safe-search override provided by the caller. */
  safeSearch?: SafeSearch
  /** Max-links override provided by the caller. */
  maxLinks?: number
  /** Max-images override provided by the caller. */
  maxImages?: number
  /** Content-limit override provided by the caller. */
  contentLimit?: number
}

/**
 * Resolves configuration by merging plugin config with runtime overrides.
 * Priority: runtime override > plugin config > default.
 *
 * @param ctl Tools provider controller exposing plugin configuration.
 * @param overrides Per-call overrides supplied by the tool invocation.
 * @returns The fully resolved configuration used to drive a request.
 */
export function resolveConfig(ctl: ToolsProviderController, overrides: ConfigOverrides): ResolvedConfig {
  const pluginConfig = ctl.getPluginConfig(configSchematics)
  const pluginPageSize = pluginConfig.get("pageSize") as number | null
  const pluginSafeSearch = pluginConfig.get("safeSearch") as SafeSearch | typeof AUTO_CONFIG_VALUE
  const pluginMaxLinks = pluginConfig.get("maxLinks") as number | null
  const pluginMaxImages = pluginConfig.get("maxImages") as number | null
  const pluginContentLimit = pluginConfig.get("contentLimit") as number | null
  const pluginVqdImageDelaySeconds = pluginConfig.get("vqdImageDelaySeconds") as number | null

  return {
    pageSize: resolvePageSize(pluginPageSize, overrides.pageSize),
    safeSearch: resolveSafeSearch(pluginSafeSearch, overrides.safeSearch),
    maxLinks: resolveAutoNumeric(pluginMaxLinks, overrides.maxLinks, DEFAULT_MAX_LINKS),
    maxImages: resolveAutoNumeric(pluginMaxImages, overrides.maxImages, DEFAULT_MAX_IMAGES),
    contentLimit: resolveAutoNumeric(pluginContentLimit, overrides.contentLimit, DEFAULT_CONTENT_LIMIT),
    vqdImageDelayMs: resolveSecondsToMs(pluginVqdImageDelaySeconds, DEFAULT_VQD_IMAGE_DELAY_MS),
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
  const vqdTtlSeconds = pluginConfig.get("vqdCacheTtlSeconds") as number | null
  const websiteTtlSeconds = pluginConfig.get("websiteCacheTtlSeconds") as number | null
  const intervalSeconds = pluginConfig.get("requestIntervalSeconds") as number | null

  return {
    searchCacheTtlMs: resolveSecondsToMs(searchTtlSeconds, DEFAULT_SEARCH_CACHE_TTL_MS),
    vqdCacheTtlMs: resolveSecondsToMs(vqdTtlSeconds, DEFAULT_VQD_CACHE_TTL_MS),
    websiteCacheTtlMs: resolveSecondsToMs(websiteTtlSeconds, DEFAULT_WEBSITE_CACHE_TTL_MS),
    requestIntervalMs: resolveSecondsToMs(intervalSeconds, DEFAULT_REQUEST_INTERVAL_MS),
  }
}

/**
 * Converts a seconds-valued plugin field (with `0` treated as "auto") to milliseconds.
 *
 * @param pluginSeconds Value read from plugin configuration, or `null` when unset.
 * @param defaultMs Fallback milliseconds value when the field is unset or `0`.
 * @returns The effective value in milliseconds.
 */
function resolveSecondsToMs(pluginSeconds: number | null, defaultMs: number): number {
  if (pluginSeconds !== null && pluginSeconds !== 0) {
    return pluginSeconds * MS_PER_SECOND
  }

  return defaultMs
}

/**
 * Resolves page size with proper priority.
 *
 * @param pluginValue Value read from plugin configuration, or `null` when unset.
 * @param override Runtime override from the tool invocation.
 * @returns The effective page size.
 */
function resolvePageSize(pluginValue: number | null, override: number | undefined): number {
  const fromPlugin = pluginValue !== null && pluginValue !== 0 ? pluginValue : undefined

  return fromPlugin ?? override ?? DEFAULT_PAGE_SIZE
}

/**
 * Resolves safe search with proper priority.
 *
 * @param pluginValue Value read from plugin configuration, possibly the auto sentinel.
 * @param override Runtime override from the tool invocation.
 * @returns The effective safe-search mode.
 */
function resolveSafeSearch(
  pluginValue: SafeSearch | typeof AUTO_CONFIG_VALUE,
  override: SafeSearch | undefined
): SafeSearch {
  const fromPlugin = pluginValue === AUTO_CONFIG_VALUE ? undefined : pluginValue

  return fromPlugin ?? override ?? DEFAULT_SAFE_SEARCH
}

/**
 * Resolves a numeric plugin value that treats `0` as an "auto" sentinel.
 *
 * @param pluginValue Value read from plugin configuration, or `null` when unset.
 * @param override Runtime override from the tool invocation.
 * @param defaultValue Fallback value when neither plugin nor override supplies a concrete number.
 * @returns The effective numeric value.
 */
function resolveAutoNumeric(pluginValue: number | null, override: number | undefined, defaultValue: number): number {
  const fromPlugin = pluginValue !== null && pluginValue !== 0 ? pluginValue : undefined

  return fromPlugin ?? override ?? defaultValue
}
