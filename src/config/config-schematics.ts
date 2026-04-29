import { createConfigSchematics } from "@lmstudio/sdk"

import { AUTO_CONFIG_VALUE } from "./auto-sentinel"

/**
 * Plugin configuration schematics registered with LM Studio.
 * Exposes the settings shown in the plugin UI.
 *
 * @const {object}
 */
export const configSchematics = createConfigSchematics()
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
      displayName: "Web Search: Include Result Snippets",
      subtitle: "Include a short preview snippet from each page alongside the title and URL.",
    },
    true
  )
  .field(
    "enrichResults",
    "boolean",
    {
      displayName: "Web Search: Enrich Results",
      subtitle:
        "Fetch each result page to extract publication date, OpenGraph type, and description. Disable to skip the per-result fan-out and return only title, URL, and snippet.",
    },
    true
  )
  .field(
    "limitWebResults",
    "boolean",
    {
      displayName: "Web Search: Limit Results",
      subtitle: "When disabled, every result returned on the requested page is included.",
    },
    true
  )
  .field(
    "webMaxResults",
    "numeric",
    {
      displayName: "Web Search: Max Results",
      subtitle: "1 to 30. Maximum web search results to return from the requested page.",
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
      displayName: "Image Search: Limit Results",
      subtitle: "When disabled, every image returned on the requested page is included.",
    },
    true
  )
  .field(
    "imageMaxResults",
    "numeric",
    {
      displayName: "Image Search: Max Results",
      subtitle: "1 to 100. Maximum image search results to return from the requested page.",
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
    "contentFormat",
    "select",
    {
      options: [
        { value: "markdown", displayName: "Markdown" },
        { value: "text", displayName: "Plain text" },
      ],
      displayName: "Visit Website: Content Format",
    },
    "markdown"
  )
  .field(
    "contentLimit",
    "numeric",
    {
      displayName: "Visit Website: Content Character Limit",
      subtitle: "1000 to 100000. Character limit applied to the extracted page content.",
      min: 1000,
      max: 100_000,
      int: true,
      slider: {
        step: 1000,
        min: 1000,
        max: 100_000,
      },
    },
    10_000
  )
  .field(
    "maxResponseMb",
    "numeric",
    {
      displayName: "Visit Website: Max Response Size (MB)",
      subtitle: "1 to 100. Caps the HTML payload fetched by Visit Website.",
      min: 1,
      max: 100,
      int: true,
      slider: {
        step: 1,
        min: 1,
        max: 100,
      },
    },
    5
  )
  .field(
    "maxImages",
    "numeric",
    {
      displayName: "View Images: Max Images",
      subtitle: "1 to 200. Maximum images scraped when View Images receives a websiteURL.",
      min: 1,
      max: 200,
      int: true,
      slider: {
        step: 1,
        min: 1,
        max: 200,
      },
    },
    10
  )
  .field(
    "maxImageMb",
    "numeric",
    {
      displayName: "Max Image Size (MB)",
      subtitle: "1 to 100. Caps per-image payload for Image Search and View Images.",
      min: 1,
      max: 100,
      int: true,
      slider: {
        step: 1,
        min: 1,
        max: 100,
      },
    },
    10
  )
  .field(
    "requestIntervalSeconds",
    "numeric",
    {
      displayName: "Min Interval Between Requests (seconds)",
      subtitle: "0 to 30 seconds. Set to 0 to disable rate limiting.",
      min: 0,
      max: 30,
      int: true,
      slider: {
        step: 1,
        min: 0,
        max: 30,
      },
    },
    5
  )
  .field(
    "imageSearchRequestDelaySeconds",
    "numeric",
    {
      displayName: "Image Search: Request Delay (seconds)",
      subtitle: "0 to 10 seconds. Delay inserted before the image search API call.",
      min: 0,
      max: 10,
      int: true,
      slider: {
        step: 1,
        min: 0,
        max: 10,
      },
    },
    2
  )
  .field(
    "maxRetries",
    "numeric",
    {
      displayName: "Max Retries Per Request",
      subtitle: "0 to 10. Set to 0 to disable retries.",
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
      subtitle: "0 to 30 seconds.",
      min: 0,
      max: 30,
      int: true,
      slider: {
        step: 1,
        min: 0,
        max: 30,
      },
    },
    1
  )
  .field(
    "retryMaxBackoffSeconds",
    "numeric",
    {
      displayName: "Retry Max Backoff (seconds)",
      subtitle: "0 to 300 seconds.",
      min: 0,
      max: 300,
      int: true,
      slider: {
        step: 5,
        min: 0,
        max: 300,
      },
    },
    30
  )
  .field(
    "searchCacheTtlSeconds",
    "numeric",
    {
      displayName: "Search Cache TTL (seconds)",
      subtitle: "0 to 3600 seconds. Set to 0 to disable caching.",
      min: 0,
      max: 3600,
      int: true,
      slider: {
        step: 60,
        min: 0,
        max: 3600,
      },
    },
    900
  )
  .field(
    "imageSearchTokenCacheTtlSeconds",
    "numeric",
    {
      displayName: "Image Search Token Cache TTL (seconds)",
      subtitle: "0 to 3600 seconds. Set to 0 to disable caching.",
      min: 0,
      max: 3600,
      int: true,
      slider: {
        step: 60,
        min: 0,
        max: 3600,
      },
    },
    600
  )
  .field(
    "websiteCacheTtlSeconds",
    "numeric",
    {
      displayName: "Website Cache TTL (seconds)",
      subtitle: "0 to 3600 seconds. Set to 0 to disable caching.",
      min: 0,
      max: 3600,
      int: true,
      slider: {
        step: 60,
        min: 0,
        max: 3600,
      },
    },
    600
  )
  .build()
