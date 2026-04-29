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
1. **Tool invocation** — [src/tools-provider.ts](src/tools-provider.ts) registers four Zod-validated tools (`createWebSearchTool`, `createImageSearchTool`, `createVisitWebsiteTool`, `createViewImagesTool`). Per-call config resolves via `resolveConfig` in [src/config/resolve-config.ts](src/config/resolve-config.ts), merging plugin UI settings from [src/config/config-schematics.ts](src/config/config-schematics.ts) with per-call overrides (runtime override > plugin config > default).
2. **Rate limit** — shared `RateLimiter` ([src/timing/rate-limiter.ts](src/timing/rate-limiter.ts), backed by `bottleneck`) enforces a `requestIntervalSeconds` gap (default 5s) between outbound requests for the global / single-target flows (DuckDuckGo search, Visit Website, image downloads). Web-search enrichment instead drives its fan-out through a `PerHostRateLimiter` ([src/timing/per-host-rate-limiter.ts](src/timing/per-host-rate-limiter.ts), backed by `Bottleneck.Group`) keyed by URL host: requests targeting the same host still observe `requestIntervalSeconds`, but results spanning distinct domains run in parallel so a 10-result enrichment pass costs roughly one fetch's worth of wall time rather than ten.
3. **HTTP + retry** — requests go through a shared `impit` client ([src/http/impit-client.ts](src/http/impit-client.ts)) wrapped by `withRetry` in [src/http/retry.ts](src/http/retry.ts) (`maxRetries`, `retryInitialBackoffSeconds`, `retryMaxBackoffSeconds`). **Do not replace `impit` with `fetch`** — it applies browser TLS fingerprints and headers that DuckDuckGo's anti-bot layer requires (see commit 9e97d38).
4. **DuckDuckGo calls** — [src/duckduckgo/](src/duckduckgo/) holds `search-web.ts`, `search-images.ts`, `fetch-vqd-token.ts`, and `build-urls.ts`. Safe-search encoding lives in [src/duckduckgo/safe-search.ts](src/duckduckgo/safe-search.ts).
5. **Parse** — [src/parsers/search-results.ts](src/parsers/search-results.ts) (HTML via jsdom, `.result__a`), [src/parsers/image-results.ts](src/parsers/image-results.ts) (JSON), [src/parsers/vqd-token.ts](src/parsers/vqd-token.ts) (homepage `input[name="vqd"]`). Image-format reasoning (URL/extension sniffing, supported-format predicates) lives separately in [src/parsers/image-extensions.ts](src/parsers/image-extensions.ts) and is shared by the search-result parser, the image downloader, and the page-image scraper.
6. **Enrich (web search only)** — every fresh DuckDuckGo result page is fed back through `fetchWebsite` (reusing the website cache + rate limiter) and run through a shared metascraper instance ([src/enrichment/](src/enrichment/)) that pulls `date`, `type`, and `description` from OpenGraph, microdata, JSON-LD, and standard HTML meta tags. The wrapper omits keys whose extraction yielded no value, so absent fields don't appear on the returned object rather than appearing as `undefined`. Cache hits skip the rate limiter; per-result failures are silently demoted to an unenriched shape rather than aborting the search. The full enriched payload is what gets cached under the `search-enriched` subdir, so warm queries skip both the DuckDuckGo fetch and the per-result fan-out.
7. **Return** — Web search returns `{ label, url, snippet?, date?, type?, description? }` records (snippet omitted when `includeSnippets` is disabled; the three metadata keys are omitted when extraction yielded nothing for that result). Image Search and View Images download files via [src/images/download-images.ts](src/images/download-images.ts) into the per-chat working directory obtained from `ctl.getWorkingDirectory()`. That call is made inside each tool's `implementation` (not at `toolsProvider` setup), since the SDK only attaches a working directory when a tool is actually invoked from a chat. On per-image download failure the tools fall back to the remote URL rather than throwing. Visit Website ([src/website/fetch-website.ts](src/website/fetch-website.ts)) returns only the page title, first-level headings, and a readable-content excerpt — no image download or link extraction. View Images accepts explicit URLs and/or scrapes images from a given page, returning per-image records with filename, alt, title, and a markdown reference to the downloaded file.

### Content extraction for Visit Website
[src/parsers/page/page-text.ts](src/parsers/page/page-text.ts) feeds raw HTML to `@mozilla/readability` to strip boilerplate (nav, sidebars, comments), then routes Readability's `.content` HTML through either:

- **Markdown** (default) — [src/text/html-to-markdown.ts](src/text/html-to-markdown.ts) via a shared `turndown` service (ATX headings, `-` bullets, fenced code, inline links, inline images). `script`/`style`/`noscript`/`template` are stripped before conversion.
- **Plain text** — [src/text/html-to-text.ts](src/text/html-to-text.ts) wraps `html-to-text` with token-conservative options: word wrapping disabled, anchor URLs dropped (only inner text kept), `<img>`/`<noscript>`/`<template>` skipped, headings and table headers left in source case rather than uppercased, and list items prefixed with `- `.

Both paths share [src/text/normalize-blank-lines.ts](src/text/normalize-blank-lines.ts) for trailing-whitespace and blank-line collapsing. Both `contentFormat` (plugin `select` field, default `"markdown"`) and `contentLimit` are plugin-only — neither is exposed as a tool parameter so the model cannot override the user-set or default values. The tool still returns `contentLength`, the pre-truncation character count, so the model can detect truncation and refine with `findInPage`.

### Image extraction for View Images
[src/parsers/page/page-images.ts](src/parsers/page/page-images.ts) scrapes `<img>` tags in document order, resolves relative `src` against the page URL, deduplicates, and returns `{ src, alt, title }` tuples (up to `maxImages`). View Images then downloads each via `downloadImages` and returns `{ filename, alt, title, image }` on success or `{ filename, alt, title, error }` on failure. `filename` is derived from the URL's last path segment via [src/fs/url-filename.ts](src/fs/url-filename.ts).

### Caches
Three **disk-backed** TTL caches (via `cacache`) are constructed once in `toolsProvider` and shared across tools. They persist across plugin reloads — clearing requires removing the cacache directory at `~/.lmstudio/plugin-data/lms-plugin-duckduckgo-cache`:

- Search results (subdir `search-enriched`) — up to 100 entries, `searchCacheTtlSeconds` (default 15 min). Stores the post-enrichment payload, so warm queries skip both the DuckDuckGo fetch and the per-result fan-out. The legacy `search` subdir from before enrichment landed is orphaned; it can be deleted by hand alongside the rest of the cacache directory.
- VQD token — up to 50 entries, `vqdCacheTtlSeconds` (default 10 min)
- Website HTML — up to 50 entries, `websiteCacheTtlSeconds` (default 10 min). Shared by Visit Website, View Images, and the web-search enrichment pass — a result that lands here once is cheap to revisit by any of the three flows.

Cache sizes and subdirs are defined in [src/tools-provider.ts](src/tools-provider.ts); the `TTLCache` implementation is in [src/cache/ttl-cache.ts](src/cache/ttl-cache.ts). TTL defaults live in [src/config/resolve-config.ts](src/config/resolve-config.ts).

### Image search specifics
Image endpoints require a **VQD token** scraped from the DuckDuckGo homepage. A configurable delay (`vqdImageDelaySeconds`, default 2s) is inserted between the VQD fetch and the image API call. The token is extracted via regex from inline script URLs of the form `vqd=<token>` (see [src/parsers/vqd-token.ts](src/parsers/vqd-token.ts)) — DuckDuckGo removed the original hidden-input form field. Token acquisition failures raise `VqdTokenError` ([src/duckduckgo/vqd-token-error.ts](src/duckduckgo/vqd-token-error.ts)) with a `VqdTokenFailureReason` of `token_not_found` or `fetch_failed`.

### Safe search encoding
DuckDuckGo uses non-obvious `p` param values: `strict→"1"`, `moderate→""`, `off→"-1"`. Centralized in [src/duckduckgo/safe-search.ts](src/duckduckgo/safe-search.ts).

### Errors
Three error hierarchies are load-bearing:

- `FetchError` ([src/http/fetch-error.ts](src/http/fetch-error.ts)) — HTTP/network failures, carries `url` and optional `cause`.
- `VqdTokenError` ([src/duckduckgo/vqd-token-error.ts](src/duckduckgo/vqd-token-error.ts)) — token acquisition.
- `NoResultsError` base with `NoWebResultsError` / `NoImageResultsError` ([src/errors/no-results-error.ts](src/errors/no-results-error.ts)).

`formatToolError` in [src/errors/tool-error.ts](src/errors/tool-error.ts) converts these into user-facing strings per tool kind (`web-search`, `image-search`, `website`, `image-download`), including abort-detection via `DOMException.name === "AbortError"`.

### Tool-file conventions
ESLint enforces two rules on `src/tools/*-tool.ts`: the file must contain exactly one exported `create<Name>Tool` factory returning `Tool`, and module-level `function` declarations other than that factory are banned. Per-tool helpers either live in a sibling module (e.g. [src/fs/url-filename.ts](src/fs/url-filename.ts), [src/parsers/page/](src/parsers/page/)) or are inlined inside the `implementation` arrow. Interfaces at module scope are allowed.

### Web-search result enrichment
[src/enrichment/](src/enrichment/) wires `metascraper` into the web-search flow. `create-metascraper.ts` builds a single in-tree rule plugin that resolves `date`, `type`, and `description` against OpenGraph, microdata, JSON-LD, and standard meta tags. Rules use `@metascraper/helpers` for the heavy lifting: `helpers.date` (chrono-node-backed) for ISO normalization across many input formats, `helpers.$jsonld` for memoized JSON-LD lookups so multiple property accesses on the same page reuse one parse pass, and `helpers.description` for the 500-char-clamped description sanitizer. The local `og:type` rule keeps a thin `trimmed()` helper since helpers does not export a generic string sanitizer. The `date` rule chain prefers `article:modified_time` over `article:published_time` so the model sees the most recent change date; helpers' `date()` collapses both into a single ISO 8601 value rather than splitting them. Types for `@metascraper/helpers` (which ships pure JS) are declared inline in [src/enrichment/metascraper-helpers.d.ts](src/enrichment/metascraper-helpers.d.ts). The wrapper only emits keys whose extraction succeeded so the per-result merge in `enrich-search-results.ts` cannot pollute records with `undefined` properties. The fan-out runs concurrently via `Promise.all` and gates each fetch on the `PerHostRateLimiter` so distinct domains run in parallel while same-host calls still observe `requestIntervalSeconds`; the website cache is consulted first per result so warm enrichment pays no rate-limit cost. Non-HTML pages (PDF, plain text, JSON) are returned without metadata since the rules only match parsed HTML.

## Key dependencies

- `@lmstudio/sdk` — plugin/tool registration
- `impit` — HTTP client with TLS + header fingerprinting (required for anti-bot)
- `jsdom` — HTML parsing
- `@mozilla/readability` — readable article extraction for Visit Website (boilerplate removal, not text extraction)
- `turndown` — HTML → Markdown conversion for Visit Website's content field
- `html-to-text` — HTML → plain-text conversion for Visit Website's content field when markdown is opted out
- `metascraper` + `@metascraper/helpers` — meta tag / OpenGraph / JSON-LD extraction backing the web-search enrichment pass. The helpers package is consumed directly (no per-field `metascraper-*` plugin packages) for `date`, `description`, and `$jsonld`; types are declared locally in [src/enrichment/metascraper-helpers.d.ts](src/enrichment/metascraper-helpers.d.ts)
- `zod` — tool parameter schemas
- `bottleneck` — backs the shared `RateLimiter`
- `cacache` — disk-backed cache store for all three TTL caches
- `file-type` — MIME sniffing for downloaded images
