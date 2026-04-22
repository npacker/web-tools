# Project Context: Web Tools Plugin for LM Studio

## Overview

**`lms-plugin-web-tools`** is an LM Studio plugin that exposes four web-oriented tools to local LLMs:

- **Web Search** — DuckDuckGo web search returning ranked `[title, url]` pairs.
- **Image Search** — DuckDuckGo image search; matching images are downloaded to the working directory so the assistant can display them.
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
├── duckduckgo/                       # DuckDuckGo API logic
│   ├── index.ts
│   ├── search-web.ts                 # Web search request + response handling
│   ├── search-images.ts              # Image search request + response handling
│   ├── fetch-vqd-token.ts            # Scrape VQD token from DuckDuckGo homepage
│   ├── vqd-token-error.ts
│   ├── safe-search.ts                # Encodes safe-search setting to DuckDuckGo `p` param
│   └── build-urls.ts                 # URL construction for search requests
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
├── parsers/                          # HTML/JSON parsing
│   ├── index.ts
│   ├── search-results-parser.ts      # Web search: HTML via jsdom, .result__a
│   ├── image-results-parser.ts       # Image search: JSON parsing
│   ├── vqd-parser.ts                 # VQD token: homepage input[name="vqd"]
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
├── timing/                           # Rate limiting and delay utilities
│   ├── index.ts
│   ├── rate-limiter.ts               # Shared RateLimiter (backed by bottleneck)
│   └── sleep.ts                      # Async delay utility
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
3. **HTTP + retry** — requests go through a shared `impit` client (`src/http/impit-client.ts`) wrapped by `withRetry` in `src/http/retry.ts` (configurable `maxRetries`, `retryInitialBackoffSeconds`, `retryMaxBackoffSeconds`). **Do not replace `impit` with `fetch`** — it applies browser TLS fingerprints and headers required by DuckDuckGo's anti-bot layer.
4. **Parsing** — HTML results go through jsdom; image JSON through a dedicated parser; VQD tokens scraped from DuckDuckGo homepage; article text through `@mozilla/readability`; Markdown conversion via `turndown`.
5. **Caching** — three **disk-backed** TTL caches (via `cacache`) persist across plugin reloads. Cache directory: `~/.lmstudio/plugin-data/lms-plugin-duckduckgo-cache`.

---

## Key Dependencies

| Dependency | Purpose |
|---|---|
| `@lmstudio/sdk` | Plugin/tool registration with LM Studio |
| `impit` | HTTP client with TLS + header fingerprinting (required to bypass DuckDuckGo anti-bot) |
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
| `pageSize` | numeric | 0 (auto) | 0–10 | Max web/image search results per page |
| `safeSearch` | select | Auto | strict/moderate/off | DuckDuckGo safe search level |
| `maxImages` | numeric | -1 (auto) | -1–200 | View Images: max images scraped when a `websiteURL` is provided |
| `contentLimit` | numeric | 0 (auto) | 0–100000 | Visit Website: max characters of text (plugin-only, not exposed as tool parameter) |
| `contentFormat` | select | markdown | markdown / text | Visit Website: output format of the content field |
| `searchCacheTtlSeconds` | numeric | 0 (auto) | 0–3600 | Search result cache duration (default 15 min) |
| `vqdCacheTtlSeconds` | numeric | 0 (auto) | 0–3600 | VQD token cache duration (default 10 min) |
| `websiteCacheTtlSeconds` | numeric | 0 (auto) | 0–3600 | Website content cache duration (default 10 min) |
| `requestIntervalSeconds` | numeric | 0 (auto) | 0–30 | Minimum gap between requests (default 5s) |
| `vqdImageDelaySeconds` | numeric | 0 (auto) | 0–10 | Delay between VQD fetch and image API call (default 2s) |

---

## Content Extraction (Visit Website)

`src/parsers/page/page-text.ts` feeds raw HTML to `@mozilla/readability` to strip boilerplate (nav, sidebars, comments), then routes Readability's `.content` HTML through either:

- **Markdown** (default) — `src/text/html-to-markdown.ts` via a shared `turndown` service (ATX headings, `-` bullets, fenced code, inline links, inline images). `script`/`style`/`noscript`/`template` are stripped before conversion.
- **Plain text** — `src/text/html-to-text.ts` walks the DOM and inserts newlines at block boundaries so paragraphs and lists remain separated without markdown syntax.

Both paths share `src/text/normalize-blank-lines.ts` for trailing-whitespace and blank-line collapsing. `contentFormat` is selectable per-call (Zod `enum`) and plugin-wide (`select` field, default `"markdown"`). `contentLimit` is plugin-only — not exposed as a tool parameter so the model cannot override the user-set or default budget. The tool still returns `contentLength`, the pre-truncation character count, so the model can detect truncation and refine with `findInPage`.

---

## Image Extraction (View Images)

`src/parsers/page/page-images.ts` scrapes `<img>` tags in document order, resolves relative `src` against the page URL, deduplicates, and returns `{ src, alt, title }` tuples (up to `maxImages`). View Images then downloads each via `downloadImages` and returns `{ filename, alt, title, image }` on success or `{ filename, alt, title, error }` on failure. `filename` is derived from the URL's last path segment via `src/fs/url-filename.ts`.

---

## Caches

Three **disk-backed** TTL caches (via `cacache`) are constructed once in `toolsProvider` and shared across tools. They persist across plugin reloads — clearing requires removing the cacache directory at `~/.lmstudio/plugin-data/lms-plugin-duckduckgo-cache`:

| Cache | Max entries | TTL config | Default |
|---|---|---|---|
| Search results | 100 | `searchCacheTtlSeconds` | 15 min |
| VQD token | 50 | `vqdCacheTtlSeconds` | 10 min |
| Website HTML | 50 | `websiteCacheTtlSeconds` | 10 min |

Cache sizes and subdirs are defined in `src/tools-provider.ts`; the `TTLCache` implementation is in `src/cache/ttl-cache.ts`. TTL defaults live in `src/config/resolve-config.ts`.

---

## Error Hierarchies

Three error hierarchies are load-bearing:

- **`FetchError`** (`src/http/fetch-error.ts`) — HTTP/network failures, carries `url` and optional `cause`.
- **`VqdTokenError`** (`src/duckduckgo/vqd-token-error.ts`) — token acquisition failures with `VqdTokenFailureReason` of `element_missing`, `value_empty`, or `fetch_failed`.
- **`NoResultsError`** base with `NoWebResultsError` / `NoImageResultsError` (`src/errors/no-results-error.ts`).

`formatToolError` in `src/errors/tool-error.ts` converts these into user-facing strings per tool kind (`web-search`, `image-search`, `website`, `image-download`), including abort-detection via `DOMException.name === "AbortError"`.

---

## Important Implementation Notes

- **Never replace `impit` with `fetch`.** DuckDuckGo's anti-bot layer requires the specific TLS fingerprint and headers that `impit` provides.
- **Safe search encoding is non-obvious:** `strict → "1"`, `moderate → ""`, `off → "-1"`. This is centralized in `src/duckduckgo/safe-search.ts`.
- **VQD tokens** are scraped from the DuckDuckGo homepage (`input[name="vqd"]`). Image endpoints require them. A configurable delay (`vqdImageDelaySeconds`, default 2s) is inserted between VQD fetch and image API call. Token acquisition failures raise `VqdTokenError`.
- **All caches are disk-backed** via `cacache` — they persist across plugin reloads. Clearing requires removing `~/.lmstudio/plugin-data/lms-plugin-duckduckgo-cache`.
- **Shared state:** `TTLCache` instances (3), `RateLimiter`, and `impit` client are created once in `toolsProvider` and shared across all tools.
- **Working directory:** `ctl.getWorkingDirectory()` is called inside each tool's `implementation` (not at `toolsProvider` setup), since the SDK only attaches a working directory when a tool is actually invoked from a chat.
- **Graceful image download:** On per-image download failure, tools fall back to the remote URL rather than throwing.
