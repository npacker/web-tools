# Project Context: Web Tools Plugin for LM Studio

## Overview

**`lms-plugin-web-tools`** is an LM Studio plugin that exposes four web-oriented tools to local LLMs:

- **Web Search** — DuckDuckGo web search returning ranked `[title, url]` pairs.
- **Image Search** — DuckDuckGo image search; matching images are downloaded to the working directory so the assistant can display them.
- **Visit Website** — fetches a URL and returns its title, first-level headings, and a search-term-aware slice of its readable content as Markdown (default) or plain text.
- **View Images** — downloads images from a list of URLs and/or scraped from a page so the assistant can display them; each record carries filename, alt, and title metadata.

Built on `@lmstudio/sdk`, it requires **Node.js >= 22** and targets **ES2023 / CommonJS**. The project is licensed under MIT. It descends from Daniel Sig's original `lms-plugin-duckduckgo` and `lms-plugin-visit-website` plugins, merged and extended by Nigel Packer.

---

## Directory Structure

```
src/
├── index.ts                          # Plugin entry point (registers config + tools provider)
├── config-schematics.ts              # LM Studio UI configuration schema (page size, safe search, caches, etc.)
│
├── tools/                            # Tool implementations
│   ├── index.ts
│   ├── tools-provider.ts             # Registers Web Search & Image Search tools via SDK
│   ├── web-search-tool.ts
│   ├── image-search-tool.ts
│   ├── visit-website-tool.ts
│   ├── view-images-tool.ts
│   ├── messages.ts                   # User-facing message strings
│   ├── search-errors.ts              # DuckDuckGo search error translations
│   └── tool-error.ts                 # Generic tool error wrapper
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
│   └── resolve-config.ts             # Merges plugin UI settings with per-call overrides
│
├── cache/                            # In-memory caching
│   ├── index.ts
│   ├── ttl-cache.ts                  # TTL-based cache for VQD tokens (10 min)
│   ├── cached-search-results.ts      # Cached search results (15 min)
│   └── search-cache-key.ts           # Deterministic cache key generation
│
├── http/                             # HTTP layer
├── images/                           # Image download utilities
├── parsers/                          # HTML/JSON parsing (jsdom, Readability, etc.)
├── text/                             # Text scraping utilities
├── timing/                           # Rate limiting and delay utilities
├── fs/                               # Filesystem utilities
└── website/                          # Website fetching logic
```

---

## Request Flow

1. **Tool invocation** via LM Studio SDK triggers the appropriate tool (Web Search, Image Search, Visit Website, View Images).
2. **Config resolution** — runtime config is resolved by merging plugin UI settings (from `config-schematics.ts`) with per-call overrides.
3. **Rate limiting** — a shared `RateLimiter` enforces a configurable gap between outbound requests (default 5s).
4. **HTTP** — requests go through `impit` (not raw `fetch`), which applies browser TLS fingerprints and headers required by DuckDuckGo's anti-bot layer. **Do not replace `impit` with `fetch`.**
5. **Parsing** — HTML results go through jsdom; image JSON through a dedicated parser; article text through `@mozilla/readability`.
6. **Caching** — VQD tokens are cached 10 min; search results 15 min; website content is cacheable with configurable TTL. All caches are in-memory only (reset on plugin reload).

---

## Key Dependencies

| Dependency | Purpose |
|---|---|
| `@lmstudio/sdk` | Plugin/tool registration with LM Studio |
| `impit` | HTTP client with TLS + header fingerprinting (required to bypass DuckDuckGo anti-bot) |
| `jsdom` | HTML parsing for web search results and website content |
| `@mozilla/readability` | Article text extraction from HTML |
| `cacache` | On-disk cache for VQD tokens, search results, and fetched HTML |
| `zod` | Runtime validation of tool parameter schemas |
| `bottleneck` | Rate limiting |
| `file-type` / `mime-types` | Content-type detection for image downloads |

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

---

## Plugin Configuration (UI Fields)

All config fields default to `0` or `"Auto"`, meaning the LLM assistant decides at runtime:

| Field | Type | Default | Range | Purpose |
|---|---|---|---|---|
| `pageSize` | numeric | 0 (auto) | 0–10 | Max web/image search results per page |
| `safeSearch` | select | Auto | strict/moderate/off/ | DuckDuckGo safe search level |
| `maxImages` | numeric | -1 (auto) | -1–200 | View Images: max images scraped when a `websiteURL` is provided |
| `contentLimit` | numeric | 0 (auto) | 0–100000 | Visit Website: max characters of text |
| `contentFormat` | select | markdown | markdown / text | Visit Website: output format of the content field |
| `searchCacheTtlSeconds` | numeric | 0 (auto) | 0–3600 | Search result cache duration |
| `vqdCacheTtlSeconds` | numeric | 0 (auto) | 0–3600 | VQD token cache duration |
| `websiteCacheTtlSeconds` | numeric | 0 (auto) | 0–3600 | Website content cache duration |
| `requestIntervalSeconds` | numeric | 0 (auto) | 0–30 | Minimum gap between requests |
| `vqdImageDelaySeconds` | numeric | 0 (auto) | 0–10 | Delay between VQD fetch and image API call |

---

## Important Implementation Notes

- **Never replace `impit` with `fetch`.** DuckDuckGo's anti-bot layer requires the specific TLS fingerprint and headers that `impit` provides.
- **Safe search encoding is non-obvious:** `strict → "1"`, `moderate → ""`, `off → "-1"`. This is centralized in `DuckDuckGoService`.
- **VQD tokens** are scraped from the DuckDuckGo homepage (`input[name="vqd"]`). Image endpoints require them. Token acquisition failures raise `VqdTokenError`.
- **Cache backends:** `TTLCache` (in-memory) for VQD tokens; `cacache` (on-disk) for search results and fetched HTML.
- **Shared state:** `TTLCache` and `RateLimiter` instances are created once in `toolsProvider` and shared across both tools. They reset on plugin reload.
