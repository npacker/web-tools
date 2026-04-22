import { createConfigSchematics } from "@lmstudio/sdk"

import { AUTO_CONFIG_VALUE } from "./auto-sentinel"

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
      subtitle: "1 to 10, 0 = default (5)",
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
      subtitle: "-1 to 200, -1 = default (40), 0 = no links",
      min: -1,
      max: 200,
      int: true,
      slider: {
        step: 1,
        min: -1,
        max: 200,
      },
    },
    -1
  )
  .field(
    "maxImages",
    "numeric",
    {
      displayName: "Visit Website: Max Images",
      subtitle: "-1 to 200, -1 = default (10), 0 = no images",
      min: -1,
      max: 200,
      int: true,
      slider: {
        step: 1,
        min: -1,
        max: 200,
      },
    },
    -1
  )
  .field(
    "contentLimit",
    "numeric",
    {
      displayName: "Visit Website: Content Character Limit",
      subtitle: "1 to 10000, 0 = default (2000)",
      min: 0,
      max: 10_000,
      int: true,
      slider: {
        step: 100,
        min: 100,
        max: 10_000,
      },
    },
    0
  )
  .field(
    "searchCacheTtlSeconds",
    "numeric",
    {
      displayName: "Search Cache TTL (seconds)",
      subtitle: "-1 to 3600 seconds, -1 = default (900), 0 = caching disabled",
      min: -1,
      max: 3600,
      int: true,
      slider: {
        step: 60,
        min: -1,
        max: 3600,
      },
    },
    -1
  )
  .field(
    "vqdCacheTtlSeconds",
    "numeric",
    {
      displayName: "VQD Token Cache TTL (seconds)",
      subtitle: "-1 to 3600 seconds, -1 = default (600), 0 = caching disabled",
      min: -1,
      max: 3600,
      int: true,
      slider: {
        step: 60,
        min: -1,
        max: 3600,
      },
    },
    -1
  )
  .field(
    "websiteCacheTtlSeconds",
    "numeric",
    {
      displayName: "Website Cache TTL (seconds)",
      subtitle: "-1 to 3600 seconds, -1 = default (600), 0 = caching disabled",
      min: -1,
      max: 3600,
      int: true,
      slider: {
        step: 60,
        min: -1,
        max: 3600,
      },
    },
    -1
  )
  .field(
    "requestIntervalSeconds",
    "numeric",
    {
      displayName: "Min Interval Between Requests (seconds)",
      subtitle: "-1 to 30, -1 = default (5), 0 = no rate limiting",
      min: -1,
      max: 30,
      int: true,
      slider: {
        step: 1,
        min: -1,
        max: 30,
      },
    },
    -1
  )
  .field(
    "maxRetries",
    "numeric",
    {
      displayName: "Max Retries Per Request",
      subtitle: "-1 to 10, -1 = default (3), 0 disables retries",
      min: -1,
      max: 10,
      int: true,
      slider: {
        step: 1,
        min: -1,
        max: 10,
      },
    },
    -1
  )
  .field(
    "retryInitialBackoffSeconds",
    "numeric",
    {
      displayName: "Retry Initial Backoff (seconds)",
      subtitle: "-1 to 30, -1 = default (1), 0 = no delay",
      min: -1,
      max: 30,
      int: true,
      slider: {
        step: 1,
        min: -1,
        max: 30,
      },
    },
    -1
  )
  .field(
    "retryMaxBackoffSeconds",
    "numeric",
    {
      displayName: "Retry Max Backoff (seconds)",
      subtitle: "-1 to 300, -1 = default (30), 0 = no delay",
      min: -1,
      max: 300,
      int: true,
      slider: {
        step: 5,
        min: -1,
        max: 300,
      },
    },
    -1
  )
  .field(
    "vqdImageDelaySeconds",
    "numeric",
    {
      displayName: "VQD to Image API Delay (seconds)",
      subtitle: "-1 to 10, -1 = default (2), 0 = no delay",
      min: -1,
      max: 10,
      int: true,
      slider: {
        step: 1,
        min: -1,
        max: 10,
      },
    },
    -1
  )
  .build()
