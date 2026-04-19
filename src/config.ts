import { createConfigSchematics } from "@lmstudio/sdk"

import { AUTO_CONFIG_VALUE } from "./constants"

/**
 * Plugin configuration schematics registered with LM Studio.
 * Exposes the page size and safe search settings shown in the plugin UI.
 */
export const configSchematics = createConfigSchematics()
  .field(
    "pageSize",
    "numeric",
    {
      displayName: "Search Results Per Page",
      subtitle: "Between 1 and 10, 0 = auto",
      min: 0,
      max: 10,
      int: true,
      slider: {
        step: 1,
        min: 1,
        max: 10,
      },
    },
    0
  )
  .field(
    "safeSearch",
    "select",
    {
      options: [
        { value: "strict", displayName: "Strict" },
        { value: "moderate", displayName: "Moderate" },
        { value: "off", displayName: "Off" },
        { value: AUTO_CONFIG_VALUE, displayName: "Auto" },
      ],
      displayName: "Safe Search",
    },
    AUTO_CONFIG_VALUE
  )
  .build()
