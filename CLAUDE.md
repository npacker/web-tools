# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LM Studio plugin that exposes four web-oriented tools to local LLMs — **Web Search**, **Image Search**, **Visit Website**, and **View Images** — built on `@lmstudio/sdk`. Descended from Daniel Sig's original `lms-plugin-duckduckgo` and `lms-plugin-visit-website` plugins, merged and extended by Nigel Packer.

## Commands

- `npm run dev` — run plugin in LM Studio dev mode (`lms dev`)
- `npm run push` — publish to LM Studio Hub (`lms push`)
- `npm run lint` / `npm run lint:fix` — ESLint on `src/**/*.ts`
- `npm run format` / `npm run format:check` — Prettier
- `npm run knip` — dead-code / unused-export check

A local pre-commit hook at `.git/hooks/pre-commit` runs `lint`, `format:check`, and `knip` sequentially and aborts the commit on any failure. The hook is **not** committed to the repo — fresh clones need to reinstall it. Bypass with `git commit --no-verify` when necessary.

No test suite is configured. TypeScript targets ES2023 / CommonJS. Requires Node >= 22 (fetch + AbortSignal.any).

## Architecture

Entry point [src/index.ts](src/index.ts) registers a config schematic and a tools provider with the LM Studio SDK.

### Request flow
1. **Tool invocation** — [src/tools/tools-provider.ts](src/tools/tools-provider.ts) registers four Zod-validated tools (`createWebSearchTool`, `createImageSearchTool`, `createVisitWebsiteTool`, `createViewImagesTool`). Per-call config resolves via `resolveConfig` in [src/config/resolve-config.ts](src/config/resolve-config.ts), merging plugin UI settings from [src/config-schematics.ts](src/config-schematics.ts) with per-call overrides (runtime override > plugin config > default).
2. **Rate limit** — shared `RateLimiter` ([src/timing/rate-limiter.ts](src/timing/rate-limiter.ts), backed by `bottleneck`) enforces a `requestIntervalSeconds` gap (default 5s) between outbound requests.
3. **HTTP + retry** — requests go through a shared `impit` client ([src/http/impit-client.ts](src/http/impit-client.ts)) wrapped by `withRetry` in [src/http/retry.ts](src/http/retry.ts) (`maxRetries`, `retryInitialBackoffSeconds`, `retryMaxBackoffSeconds`). **Do not replace `impit` with `fetch`** — it applies browser TLS fingerprints and headers that DuckDuckGo's anti-bot layer requires (see commit 9e97d38).
4. **DuckDuckGo calls** — [src/duckduckgo/](src/duckduckgo/) holds `search-web.ts`, `search-images.ts`, `fetch-vqd-token.ts`, and `build-urls.ts`. Safe-search encoding lives in [src/duckduckgo/safe-search.ts](src/duckduckgo/safe-search.ts).
5. **Parse** — [src/parsers/search-results-parser.ts](src/parsers/search-results-parser.ts) (HTML via jsdom, `.result__a`), [src/parsers/image-results-parser.ts](src/parsers/image-results-parser.ts) (JSON), [src/parsers/vqd-parser.ts](src/parsers/vqd-parser.ts) (homepage `input[name="vqd"]`).
6. **Return** — Web returns `[title, url]` pairs. Image search, Visit Website, and View Images download files via [src/images/download-images.ts](src/images/download-images.ts) into the per-chat working directory obtained from `ctl.getWorkingDirectory()`. That call is made inside each tool's `implementation` (not at `toolsProvider` setup), since the SDK only attaches a working directory when a tool is actually invoked from a chat. On per-image download failure the tools fall back to the remote URL rather than throwing. Visit Website ([src/website/fetch-website.ts](src/website/fetch-website.ts)) extracts readable content via `@mozilla/readability` plus headings/links/images, with optional pagination and search-term bias. View Images accepts explicit URLs or scrapes from a given page.

### Caches
Three **disk-backed** TTL caches (via `cacache`) are constructed once in `toolsProvider` and shared across tools. They persist across plugin reloads — clearing requires removing the cacache directory at `~/.lmstudio/plugin-data/lms-plugin-duckduckgo-cache`:

- Search results — up to 100 entries, `searchCacheTtlSeconds` (default 15 min)
- VQD token — up to 50 entries, `vqdCacheTtlSeconds` (default 10 min)
- Website HTML — up to 50 entries, `websiteCacheTtlSeconds` (default 10 min)

Cache sizes and subdirs are defined in [src/tools/tools-provider.ts](src/tools/tools-provider.ts); the `TTLCache` implementation is in [src/cache/ttl-cache.ts](src/cache/ttl-cache.ts). TTL defaults live in [src/config/resolve-config.ts](src/config/resolve-config.ts).

### Image search specifics
Image endpoints require a **VQD token** scraped from the DuckDuckGo homepage. A configurable delay (`vqdImageDelaySeconds`, default 2s) is inserted between the VQD fetch and the image API call. Token acquisition failures raise `VqdTokenError` ([src/duckduckgo/vqd-token-error.ts](src/duckduckgo/vqd-token-error.ts)) with a `VqdTokenFailureReason` of `element_missing`, `value_empty`, or `fetch_failed`.

### Safe search encoding
DuckDuckGo uses non-obvious `p` param values: `strict→"1"`, `moderate→""`, `off→"-1"`. Centralized in [src/duckduckgo/safe-search.ts](src/duckduckgo/safe-search.ts).

### Errors
Three error hierarchies are load-bearing:

- `FetchError` ([src/http/fetch-error.ts](src/http/fetch-error.ts)) — HTTP/network failures, carries `url` and optional `cause`.
- `VqdTokenError` ([src/duckduckgo/vqd-token-error.ts](src/duckduckgo/vqd-token-error.ts)) — token acquisition.
- `NoResultsError` base with `NoWebResultsError` / `NoImageResultsError` ([src/tools/no-results-error.ts](src/tools/no-results-error.ts)).

`formatToolError` in [src/tools/tool-error.ts](src/tools/tool-error.ts) converts these into user-facing strings per tool kind (`web-search`, `image-search`, `website`, `image-download`), including abort-detection via `DOMException.name === "AbortError"`.

## Key dependencies

- `@lmstudio/sdk` — plugin/tool registration
- `impit` — HTTP client with TLS + header fingerprinting (required for anti-bot)
- `jsdom` — HTML parsing
- `@mozilla/readability` — readable article extraction for Visit Website
- `zod` — tool parameter schemas
- `bottleneck` — backs the shared `RateLimiter`
- `cacache` — disk-backed cache store for all three TTL caches
- `file-type` — MIME sniffing for downloaded images
