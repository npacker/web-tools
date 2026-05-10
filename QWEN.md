# Project Context: Web Tools Plugin for LM Studio

## Overview

**`lms-plugin-web-tools`** is an LM Studio plugin that exposes four web-oriented tools to local LLMs:

- **Web Search** — DuckDuckGo web search returning ranked `[title, url]` pairs (with optional snippet/date/type/description enrichment).
- **Image Search** — Bing image search; matching images are downloaded to the working directory so the assistant can display them, returned as records with the file path or remote URL plus Bing's title and source-page metadata.
- **Visit Website** — fetches a URL and returns its title, first-level headings, and a search-term-aware slice of its readable content as Markdown (default) or plain text.
- **View Images** — downloads images from a list of URLs and/or scraped from a page so the assistant can display them; each record carries filename, alt, and title metadata.

Built on `@lmstudio/sdk`, it requires **Node.js >= 22** and targets **ES2023 / CommonJS**. The project is licensed under MIT. It descends from Daniel Sig's original `lms-plugin-duckduckgo` and `lms-plugin-visit-website` plugins, merged and extended by Nigel Packer. The plugin is at **revision 5** (see `manifest.json`).

---

## Directory Structure

```
src/
├── index.ts                          # Plugin entry point (registers config + tools provider)
├── tools-provider.ts                 # Registers all four tools via SDK
│
├── tools/                            # Tool implementations
│   ├── web-search-tool.ts
│   ├── image-search-tool.ts
│   ├── visit-website-tool.ts
│   └── view-images-tool.ts
│
├── duckduckgo/                       # DuckDuckGo web search
│   ├── index.ts
│   ├── search-web.ts                 # Web search request + response handling
│   ├── safe-search.ts                # SafeSearch type + DuckDuckGo `p` param encoding
│   └── build-urls.ts                 # URL construction for web-search requests
│
├── bing/                             # Bing image search
│   ├── index.ts
│   ├── search-images.ts              # Fetches Bing's image-search HTML page
│   ├── parse-results.ts              # Extracts image tiles from `<a class="iusc" m="...">`
│   └── build-urls.ts                 # URL construction (q, first, adlt)
│
├── config/                           # Configuration resolution
│   ├── auto-sentinel.ts              # Special value (0/Auto) meaning "let the LLM decide"
│   ├── config-schematics.ts          # LM Studio UI configuration schema
│   └── resolve-config.ts             # Merges plugin UI settings with per-call overrides
│
├── cache/                            # Cache infrastructure
│   ├── index.ts
│   ├── ttl-cache.ts                  # Disk-backed TTL cache via cacache
│   ├── cached-search-results.ts      # Cached search results payload type
│   └── search-cache-key.ts           # Deterministic cache key generation
│
├── errors/                           # Error hierarchies
│   ├── index.ts
│   ├── no-results-error.ts           # NoResultsError, NoWebResultsError, NoImageResultsError
│   └── tool-error.ts                 # formatToolError, isAbortError, errorMessage
│
├── http/                             # HTTP layer
│   ├── index.ts
│   ├── fetch-ok.ts                   # Fetch with error wrapping
│   ├── fetch-error.ts                # FetchError class (carries url + optional cause)
│   ├── impit-client.ts               # Shared impit client creation
│   └── retry.ts                      # withRetry wrapper (maxRetries, backoff config)
│
├── images/                           # Image download utilities
│   ├── index.ts
│   ├── download-image.ts             # Single image download
│   └── download-images.ts            # Batch image download
│
├── parsers/                          # Generic HTML parsing
│   ├── index.ts
│   ├── search-results.ts             # Web search: HTML via jsdom, .result__a
│   ├── image-extensions.ts           # Supported-image-extension predicates (URL, content-type)
│   └── page/                         # Page-level extraction
│       ├── page-images.ts            # Scrapes <img> tags for View Images
│       └── page-text.ts              # Feeds HTML to @mozilla/readability
│
├── text/                             # Text scraping utilities
│   ├── index.ts
│   ├── html-to-markdown.ts           # HTML → Markdown via turndown service
│   ├── html-to-text.ts               # HTML → plain text (DOM walk, block-boundary newlines)
│   ├── normalize-text.ts             # Text normalization utilities
│   └── normalize-blank-lines.ts      # Trailing-whitespace and blank-line collapsing
│
├── timing/                           # Rate limiting
│   ├── index.ts
│   ├── rate-limiter.ts               # Shared RateLimiter (backed by bottleneck)
│   └── per-host-rate-limiter.ts      # Per-host limiter for the web-search enrichment fan-out
│
├── fs/                               # Filesystem utilities
│   ├── index.ts
│   ├── url-filename.ts               # Derives filename from URL's last path segment
│   ├── lmstudio-home.ts              # Finds LM Studio home directory
│   └── markdown-path.ts              # Converts file paths to markdown references
│
└── website/                          # Website fetching logic
    ├── index.ts
    └── fetch-website.ts
```

---

## Request Flow

1. **Tool invocation** — `tools-provider.ts` registers four Zod-validated tools (`createWebSearchTool`, `createImageSearchTool`, `createVisitWebsiteTool`, `createViewImagesTool`). Per-call config resolves via `resolveConfig`, merging plugin UI settings from `config/config-schematics.ts` with per-call overrides (runtime override > plugin config > default).
2. **Rate limiting** — a shared `RateLimiter` (`src/timing/rate-limiter.ts`, backed by `bottleneck`) enforces a `requestIntervalSeconds` gap (default 5s) between outbound requests.
3. **HTTP + retry** — requests go through a shared `impit` client (`src/http/impit-client.ts`) wrapped by `withRetry` in `src/http/retry.ts` (configurable `maxRetries`, `retryInitialBackoffSeconds`, `retryMaxBackoffSeconds`). **Do not replace `impit` with `fetch`** — it applies browser TLS fingerprints and headers required by DuckDuckGo's and Bing's anti-bot layers (DDG outright blocks bare `fetch`; Bing degrades the response to a mobile shell).
4. **Parsing** — DuckDuckGo web-search HTML through jsdom (`.result__a`); Bing image-search HTML through jsdom reading the JSON-encoded `m` attribute on `<a class="iusc">` tiles; article text through `@mozilla/readability`; Markdown conversion via `turndown`.
5. **Caching** — two **disk-backed** TTL caches (via `cacache`) persist across plugin reloads — one for enriched web-search payloads, one for fetched website HTML. Cache directory: `~/.lmstudio/plugin-data/lms-plugin-duckduckgo-cache`. Image search is not cached.

---

## Key Dependencies

| Dependency | Purpose |
|---|---|
| `@lmstudio/sdk` | Plugin/tool registration with LM Studio |
| `impit` | HTTP client with TLS + header fingerprinting (required to bypass DuckDuckGo and Bing anti-bot) |
| `jsdom` | HTML parsing for web search results and website content |
| `@mozilla/readability` | Article text extraction for Visit Website (boilerplate removal) |
| `turndown` | HTML → Markdown conversion for Visit Website's content field |
| `cacache` | Disk-backed cache store for all three TTL caches |
| `zod` | Runtime validation of tool parameter schemas |
| `bottleneck` | Backs the shared `RateLimiter` |
| `file-type` | MIME sniffing for downloaded images |

---

## Build & Development Commands

```bash
# Install dependencies
npm install

# Run plugin in LM Studio dev mode (hot-reload for testing)
npm run dev

# Publish plugin to LM Studio Hub
npm run push

# Linting
npm run lint          # Check
npm run lint:fix      # Auto-fix

# Formatting
npm run format        # Write prettier formatting
npm run format:check  # Check without writing

# Unused dependency detection
npm run knip
```

> **Note:** No test suite is currently configured.

### Pre-commit Hook

A local pre-commit hook at `.git/hooks/pre-commit` runs `lint`, `format:check`, and `knip` sequentially and aborts the commit on any failure. The hook is **not** committed to the repo — fresh clones need to reinstall it. Bypass with `git commit --no-verify` when necessary.

---

## TypeScript Configuration

- **Target:** ES2023
- **Module:** ES modules in source → compiled to CommonJS (`outDir: "dist"`)
- **Module resolution:** `bundler`
- **Strict mode:** enabled
- **Source maps + declaration files:** enabled
- **Root dir:** `src/`, output dir: `dist/`

---

## ESLint / Code Quality

The project uses a comprehensive ESLint configuration (ESLint v10+) with these notable rules:

- **Type safety:** no `any`, no unsafe returns/arguments/assignments/calls/member-access, floating promises must be awaited, switch exhaustiveness checked.
- **Import style:** `consistent-type-imports` (inline-type-imports), no default exports, alphabetical ordering, cycle detection (max depth 3).
- **JSDoc:** required on all exports and declarations (publicOnly disabled).
- **Style:** strict boolean expressions, nullish coalescing where applicable, prefer-readonly, no param reassignment, no await in loops, prefer-template, curly braces always, object shorthand, prefer-destructuring (objects).
- **Ban files:** `constants.ts` and `types.ts` are banned — co-locate declarations with themed files instead.
- **Prettier:** integrated, errors treated as ESLint errors.
- **Cognitive complexity:** capped at 15 per function (sonarjs).
- **Duplicate strings:** capped at 4 occurrences (sonarjs).
- **Tool-file conventions:** ESLint enforces that `src/tools/*-tool.ts` files contain exactly one exported `create<Name>Tool` factory returning `Tool`. Module-level `function` declarations other than that factory are banned. Per-tool helpers either live in a sibling module or are inlined inside the `implementation` arrow.

---

## Plugin Configuration (UI Fields)

All config fields default to `0` or `"Auto"`, meaning the LLM assistant decides at runtime:

| Field | Type | Default | Range | Purpose |
|---|---|---|---|---|
| `limitWebResults` | boolean | true | true/false | When enabled, caps web-search results at `webMaxResults`; when disabled, returns the full DDG page (~30). |
| `webMaxResults` | numeric | 10 | 1–30 | Max web-search results per page; hidden when `limitWebResults` is off (plugin-only, not exposed as tool parameter). |
| `limitImageResults` | boolean | true | true/false | When enabled, caps image-search results at `imageMaxResults`; when disabled, returns the full Bing page (~35). |
| `imageMaxResults` | numeric | 10 | 1–35 | Max image-search results per page; hidden when `limitImageResults` is off (plugin-only, not exposed as tool parameter). Tops out at Bing's native page size of 35. |
| `safeSearch` | select | Auto | strict/moderate/off | Safe-search mode applied to both DDG web search and Bing image search. |
| `maxImages` | numeric | -1 (auto) | -1–200 | View Images: max images scraped when a `websiteURL` is provided |
| `contentLimit` | numeric | 0 (auto) | 0–100000 | Visit Website: max characters of text (plugin-only, not exposed as tool parameter) |
| `contentFormat` | select | markdown | markdown / text | Visit Website: output format of the content field (plugin-only, not exposed as tool parameter) |
| `searchCacheTtlSeconds` | numeric | 0 (auto) | 0–3600 | Web-search result cache duration (default 15 min) |
| `websiteCacheTtlSeconds` | numeric | 0 (auto) | 0–3600 | Website content cache duration (default 10 min) |
| `requestIntervalSeconds` | numeric | 0 (auto) | 0–30 | Minimum gap between outbound search requests (default 5s) |

---

## Content Extraction (Visit Website)

`src/parsers/page/page-text.ts` feeds raw HTML to `@mozilla/readability` to strip boilerplate (nav, sidebars, comments), then routes Readability's `.content` HTML through either:

- **Markdown** (default) — `src/text/html-to-markdown.ts` via a shared `turndown` service (ATX headings, `-` bullets, fenced code, inline links, inline images). `script`/`style`/`noscript`/`template` are stripped before conversion.
- **Plain text** — `src/text/html-to-text.ts` walks the DOM and inserts newlines at block boundaries so paragraphs and lists remain separated without markdown syntax.

Both paths share `src/text/normalize-blank-lines.ts` for trailing-whitespace and blank-line collapsing. Both `contentFormat` (plugin `select` field, default `"markdown"`) and `contentLimit` are plugin-only — neither is exposed as a tool parameter so the model cannot override the user-set or default values. The tool still returns `contentLength`, the pre-truncation character count, so the model can detect truncation and refine with `findInPage`.

---

## Image Extraction (View Images)

`src/parsers/page/page-images.ts` scrapes `<img>` tags in document order, resolves relative `src` against the page URL, deduplicates, and returns `{ src, alt, title }` tuples (up to `maxImages`). View Images then downloads each via `downloadImages` and returns `{ filename, alt, title, image }` on success or `{ filename, alt, title, error }` on failure. `filename` is derived from the URL's last path segment via `src/fs/url-filename.ts`.

---

## Caches

Two **disk-backed** TTL caches (via `cacache`) are constructed once in `toolsProvider` and shared across tools. They persist across plugin reloads — clearing requires removing the cacache directory at `~/.lmstudio/plugin-data/lms-plugin-duckduckgo-cache`:

| Cache | Max entries | TTL config | Default |
|---|---|---|---|
| Search results (subdir `search-enriched`) | 100 | `searchCacheTtlSeconds` | 15 min |
| Website HTML (subdir `website`) | 50 | `websiteCacheTtlSeconds` | 10 min |

Image search is not cached — Bing's metadata payload is small and the rate limiter alone caps fetch rate.

Cache sizes and subdirs are defined in `src/tools-provider.ts`; the `TTLCache` implementation is in `src/cache/ttl-cache.ts`. TTL defaults live in `src/config/resolve-config.ts`.

---

## Error Hierarchies

Two error hierarchies are load-bearing:

- **`FetchError`** (`src/http/fetch-error.ts`) — HTTP/network failures, carries `url` and optional `cause`.
- **`NoResultsError`** base with `NoWebResultsError` / `NoImageResultsError` (`src/errors/no-results-error.ts`).

`formatToolError` in `src/errors/tool-error.ts` converts these into user-facing strings per tool kind (`web-search`, `image-search`, `website`, `image-download`), including abort-detection via `DOMException.name === "AbortError"`.

---

## Important Implementation Notes

- **Never replace `impit` with `fetch`.** Both DuckDuckGo's and Bing's anti-bot layers require the specific TLS fingerprint and headers that `impit` provides.
- **DuckDuckGo safe-search encoding is non-obvious:** `strict → "1"`, `moderate → ""`, `off → "-1"`. Centralized in `src/duckduckgo/safe-search.ts`. Bing accepts the literal mode strings on its `adlt` parameter, so `src/bing/build-urls.ts` passes `SafeSearch` through unchanged.
- **Image search via Bing:** Each `<a class="iusc">` tile carries a JSON-encoded `m` attribute with `murl` (full image URL), `purl` (source page), and `t` (title). jsdom returns the attribute already entity-decoded, so the parser feeds it straight to `JSON.parse`; malformed tiles are swallowed individually. Bing returns ~35 tiles per page; pagination advances by 35 via the `first` query parameter.
- **All caches are disk-backed** via `cacache` — they persist across plugin reloads. Clearing requires removing `~/.lmstudio/plugin-data/lms-plugin-duckduckgo-cache`.
- **Shared state:** `TTLCache` instances (2), `RateLimiter`, `PerHostRateLimiter`, and `impit` client are created once in `toolsProvider` and shared across all tools.
- **Working directory:** `ctl.getWorkingDirectory()` is called inside each tool's `implementation` (not at `toolsProvider` setup), since the SDK only attaches a working directory when a tool is actually invoked from a chat.
- **Graceful image download:** On per-image download failure, tools fall back to the remote URL rather than throwing.
