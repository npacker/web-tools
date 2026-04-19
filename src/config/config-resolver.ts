/**
 * Configuration resolution utilities
 */

import { ToolsProviderController } from "@lmstudio/sdk"

import { configSchematics } from "../config"
import { DEFAULT_PAGE_SIZE, DEFAULT_SAFE_SEARCH, AUTO_CONFIG_VALUE } from "../constants"

import type { SafeSearch } from "../types"

export interface ResolvedConfig {
  pageSize: number
  safeSearch: SafeSearch
}

export interface ConfigOverrides {
  pageSize?: number
  safeSearch?: SafeSearch
}

/**
 * Resolves configuration by merging plugin config with runtime overrides
 * Priority: runtime override > plugin config > default
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
 * Resolves page size with proper priority
 */
function resolvePageSize(pluginValue: number | null, override: number | undefined): number {
  const fromPlugin = pluginValue !== null && pluginValue !== 0 ? pluginValue : undefined

  return fromPlugin ?? override ?? DEFAULT_PAGE_SIZE
}

/**
 * Resolves safe search with proper priority
 */
function resolveSafeSearch(
  pluginValue: SafeSearch | typeof AUTO_CONFIG_VALUE,
  override: SafeSearch | undefined
): SafeSearch {
  const fromPlugin = pluginValue === AUTO_CONFIG_VALUE ? undefined : pluginValue

  return fromPlugin ?? override ?? DEFAULT_SAFE_SEARCH
}
