import { createConfigSchematics } from "@lmstudio/sdk"

import { AUTO_CONFIG_VALUE } from "./auto-sentinel"

/**
 * Plugin configuration schematics registered with LM Studio.
 * Exposes the page size and safe search settings shown in the plugin UI.
 *
 * @const {object}
 */
export const configSchematics = createConfigSchematics()
  .field(
    "limitWebResults",
    "boolean",
    {
      displayName: "Limit Web Search Results",
      subtitle: "When disabled, every result DuckDuckGo returns on the requested page is included.",
    },
    true
  )
  .field(
    "webMaxResults",
    "numeric",
    {
      displayName: "Web Search: Max Results",
      subtitle: "1 to 30. Caps results per page; DuckDuckGo returns up to ~30.",
      min: 1,
      max: 30,
      int: true,
      slider: {
        step: 1,
        min: 1,
        max: 30,
      },
      dependencies: [{ key: "limitWebResults", condition: { type: "equals", value: true } }],
    },
    10
  )
  .field(
    "limitImageResults",
    "boolean",
    {
      displayName: "Limit Image Search Results",
      subtitle: "When disabled, every image DuckDuckGo returns on the requested page is included.",
    },
    true
  )
  .field(
    "imageMaxResults",
    "numeric",
    {
      displayName: "Image Search: Max Results",
      subtitle: "1 to 100. Caps results per page; DuckDuckGo returns up to ~100.",
      min: 1,
      max: 100,
      int: true,
      slider: {
        step: 1,
        min: 1,
        max: 100,
      },
      dependencies: [{ key: "limitImageResults", condition: { type: "equals", value: true } }],
    },
    10
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
    "includeSnippets",
    "boolean",
    {
      displayName: "Include Snippets in Search Results",
      subtitle: "When enabled, web search results include a preview text snippet from each page",
    },
    true
  )
  .field(
    "maxImages",
    "numeric",
    {
      displayName: "View Images: Max Images",
      subtitle: "-1 to 200, -1 = default (10). Maximum images scraped when View Images receives a websiteURL.",
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
      subtitle: "1 to 100000, 0 = default (10000)",
      min: 0,
      max: 100_000,
      int: true,
      slider: {
        step: 1000,
        min: 0,
        max: 100_000,
      },
    },
    0
  )
  .field(
    "contentFormat",
    "select",
    {
      options: [
        { value: "markdown", displayName: "Markdown" },
        { value: "text", displayName: "Plain text" },
      ],
      displayName: "Visit Website: Content Format",
      subtitle:
        "Markdown retains headings, lists, and inline links; plain text strips syntax and preserves only line breaks.",
    },
    "markdown"
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
    "maxResponseMb",
    "numeric",
    {
      displayName: "Visit Website: Max Response Size (MB)",
      subtitle: "1 to 100, -1 = default (5). Caps the HTML payload fetched by Visit Website.",
      min: -1,
      max: 100,
      int: true,
      slider: {
        step: 1,
        min: -1,
        max: 100,
      },
    },
    -1
  )
  .field(
    "maxImageMb",
    "numeric",
    {
      displayName: "Max Image Size (MB)",
      subtitle: "1 to 100, -1 = default (10). Caps per-image payload for Image Search and View Images.",
      min: -1,
      max: 100,
      int: true,
      slider: {
        step: 1,
        min: -1,
        max: 100,
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
