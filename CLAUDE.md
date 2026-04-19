# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LM Studio plugin that exposes four web-oriented tools to local LLMs — **Web Search**, **Image Search**, **Visit Website**, and **View Images** — built on `@lmstudio/sdk`. Descended from Daniel Sig's original `lms-plugin-duckduckgo` and `lms-plugin-visit-website` plugins, merged and extended by Nigel Packer.

## Commands

- `npm run dev` — run plugin in LM Studio dev mode (`lms dev`)
- `npm run push` — publish to LM Studio Hub (`lms push`)
- `npm run lint` / `npm run lint:fix` — ESLint on `src/**/*.ts`
- `npm run format` / `npm run format:check` — Prettier

No test suite is configured. TypeScript targets ES2023 / CommonJS. Requires Node >= 22 (fetch + AbortSignal.any).

## Architecture

Entry point [src/index.ts](src/index.ts) registers a config schematic and a tools provider with the LM Studio SDK.

### Request flow
1. **Tool invocation** — [src/tools-provider.ts](src/tools-provider.ts) defines two Zod-validated tools (Web Search, Image Search). Each invocation resolves runtime config via [src/config/config-resolver.ts](src/config/config-resolver.ts) (merges plugin UI settings from [src/config.ts](src/config.ts) with per-call overrides).
2. **Rate limit** — shared [RateLimiter](src/utils/rate-limiter.ts) enforces a 5s gap between outbound requests (see [src/constants.ts](src/constants.ts)).
3. **HTTP** — [DuckDuckGoService](src/services/duck-duck-go-service.ts) issues requests through a shared `impit` client. **Do not replace `impit` with `fetch`** — it applies browser TLS fingerprints and headers that DuckDuckGo's anti-bot layer requires (see commit 9e97d38).
4. **Parse** — HTML results go through [src/parsers/html-parser.ts](src/parsers/html-parser.ts) (jsdom, `.result__a` selector); image JSON goes through [src/parsers/image-parser.ts](src/parsers/image-parser.ts).
5. **Return** — Web returns `[title, url]` pairs. Image search additionally downloads files via [ImageDownloadService](src/services/image-download-service.ts) to the working dir; on download failure it falls back to the remote URL rather than throwing.

### Image search specifics
Image endpoints require a **VQD token** scraped from the DuckDuckGo homepage (`input[name="vqd"]`). Tokens are cached 10 min in a [TTLCache](src/cache/ttl-cache.ts); search results are cached 15 min. A 2s delay is inserted between the VQD fetch and the image API call. Token acquisition failures raise `VqdTokenError` ([src/errors.ts](src/errors.ts)).

### Safe search encoding
DuckDuckGo uses non-obvious `p` param values: `strict→"1"`, `moderate→""`, `off→"-1"`. Centralized in `DuckDuckGoService`.

### Shared state
`TTLCache` and `RateLimiter` instances are created once in `toolsProvider` and shared across both tools. They are in-memory only and reset on plugin reload.

## Key dependencies

- `@lmstudio/sdk` — plugin/tool registration
- `impit` — HTTP client with TLS + header fingerprinting (required for anti-bot)
- `jsdom` — HTML parsing
- `zod` — tool parameter schemas
