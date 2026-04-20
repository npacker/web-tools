/**
 * DuckDuckGo Plugin for LM Studio.
 *
 * Main entry point that registers tools and configuration.
 */

import { configSchematics } from "./config/config-schematics"
import { toolsProvider } from "./tools"

import type { PluginContext } from "@lmstudio/sdk"

/**
 * Plugin entry point invoked by LM Studio to register configuration and tools.
 *
 * @param context Plugin context supplied by the LM Studio SDK.
 * @returns A promise that resolves once registration completes.
 */
export async function main(context: PluginContext): Promise<void> {
  context.withConfigSchematics(configSchematics)
  context.withToolsProvider(toolsProvider)
}
