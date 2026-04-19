import { createConfigSchematics } from "@lmstudio/sdk"

import { AUTO_CONFIG_VALUE } from "./config/auto-sentinel"

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
  .field(
    "maxLinks",
    "numeric",
    {
      displayName: "Visit Website: Max Links",
      subtitle: "Between 0 and 200, 0 = auto",
      min: 0,
      max: 200,
      int: true,
      slider: {
        step: 1,
        min: 0,
        max: 200,
      },
    },
    0
  )
  .field(
    "maxImages",
    "numeric",
    {
      displayName: "Visit Website: Max Images",
      subtitle: "Between 0 and 200, 0 = auto",
      min: 0,
      max: 200,
      int: true,
      slider: {
        step: 1,
        min: 0,
        max: 200,
      },
    },
    0
  )
  .field(
    "contentLimit",
    "numeric",
    {
      displayName: "Visit Website: Content Character Limit",
      subtitle: "Between 0 and 10000, 0 = auto",
      min: 0,
      max: 10_000,
      int: true,
      slider: {
        step: 100,
        min: 0,
        max: 10_000,
      },
    },
    0
  )
  .build()
