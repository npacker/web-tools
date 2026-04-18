/**
 * DuckDuckGo Plugin for LM Studio
 *
 * Main entry point that registers tools and configuration
 */

import { PluginContext } from "@lmstudio/sdk"
import { toolsProvider } from "./toolsProvider"
import { configSchematics } from "./config"

export async function main(context: PluginContext): Promise<void> {
  context.withConfigSchematics(configSchematics)
  context.withToolsProvider(toolsProvider)
}
