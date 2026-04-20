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
  .field(
    "searchCacheTtlSeconds",
    "numeric",
    {
      displayName: "Search Cache TTL (seconds)",
      subtitle: "Between 0 and 3600, 0 = auto",
      min: 0,
      max: 3600,
      int: true,
      slider: {
        step: 60,
        min: 0,
        max: 3600,
      },
    },
    0
  )
  .field(
    "vqdCacheTtlSeconds",
    "numeric",
    {
      displayName: "VQD Token Cache TTL (seconds)",
      subtitle: "Between 0 and 3600, 0 = auto",
      min: 0,
      max: 3600,
      int: true,
      slider: {
        step: 60,
        min: 0,
        max: 3600,
      },
    },
    0
  )
  .field(
    "websiteCacheTtlSeconds",
    "numeric",
    {
      displayName: "Website Cache TTL (seconds)",
      subtitle: "Between 0 and 3600, 0 = auto",
      min: 0,
      max: 3600,
      int: true,
      slider: {
        step: 60,
        min: 0,
        max: 3600,
      },
    },
    0
  )
  .field(
    "requestIntervalSeconds",
    "numeric",
    {
      displayName: "Min Interval Between Requests (seconds)",
      subtitle: "Between 0 and 30, 0 = auto",
      min: 0,
      max: 30,
      int: true,
      slider: {
        step: 1,
        min: 0,
        max: 30,
      },
    },
    0
  )
  .field(
    "maxRetries",
    "numeric",
    {
      displayName: "Max Retries Per Request",
      subtitle: "Between 0 and 10, 0 disables retries",
      min: 0,
      max: 10,
      int: true,
      slider: {
        step: 1,
        min: 0,
        max: 10,
      },
    },
    3
  )
  .field(
    "retryInitialBackoffSeconds",
    "numeric",
    {
      displayName: "Retry Initial Backoff (seconds)",
      subtitle: "Between 0 and 30, 0 = auto",
      min: 0,
      max: 30,
      int: true,
      slider: {
        step: 1,
        min: 0,
        max: 30,
      },
    },
    0
  )
  .field(
    "retryMaxBackoffSeconds",
    "numeric",
    {
      displayName: "Retry Max Backoff (seconds)",
      subtitle: "Between 0 and 300, 0 = auto",
      min: 0,
      max: 300,
      int: true,
      slider: {
        step: 5,
        min: 0,
        max: 300,
      },
    },
    0
  )
  .field(
    "vqdImageDelaySeconds",
    "numeric",
    {
      displayName: "VQD to Image API Delay (seconds)",
      subtitle: "Between 0 and 10, 0 = auto",
      min: 0,
      max: 10,
      int: true,
      slider: {
        step: 1,
        min: 0,
        max: 10,
      },
    },
    0
  )
  .build()
