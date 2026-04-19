/**
 * DuckDuckGo Plugin for LM Studio
 *
 * Main entry point that registers tools and configuration
 */

import { PluginContext } from "@lmstudio/sdk"

import { configSchematics } from "./config"
import { toolsProvider } from "./tools-provider"

export async function main(context: PluginContext): Promise<void> {
  context.withConfigSchematics(configSchematics)
  context.withToolsProvider(toolsProvider)
}
