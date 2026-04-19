/**
 * Configuration resolution utilities.
 */

import { ToolsProviderController } from "@lmstudio/sdk"

import { configSchematics } from "../config"
import { DEFAULT_PAGE_SIZE, DEFAULT_SAFE_SEARCH, AUTO_CONFIG_VALUE } from "../constants"

import type { SafeSearch } from "../types"

/**
 * Fully resolved configuration used by a tool invocation.
 */
export interface ResolvedConfig {
  /** Number of results to request per page. */
  pageSize: number
  /** Safe-search mode to apply to the request. */
  safeSearch: SafeSearch
}

/**
 * Optional per-invocation overrides applied on top of plugin configuration.
 */
export interface ConfigOverrides {
  /** Page size override provided by the caller. */
  pageSize?: number
  /** Safe-search override provided by the caller. */
  safeSearch?: SafeSearch
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

  const pageSize = resolvePageSize(pluginPageSize, overrides.pageSize)
  const safeSearch = resolveSafeSearch(pluginSafeSearch, overrides.safeSearch)

  return { pageSize, safeSearch }
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
