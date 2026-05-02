# Web Tools Plugin for LM Studio

An LM Studio plugin that gives local LLMs four web-oriented tools built on `@lmstudio/sdk`. Web and image search are backed by DuckDuckGo (via the browser-fingerprinting [`impit`](https://www.npmjs.com/package/impit) HTTP client), website visits use [`@mozilla/readability`](https://www.npmjs.com/package/@mozilla/readability) for article extraction plus [`turndown`](https://www.npmjs.com/package/turndown) for clean Markdown output, and images referenced by the image-oriented tools are downloaded into the chat's working directory so the assistant can display them inline.

## Tools

### Web Search

DuckDuckGo web search with per-result metadata enrichment.

| Parameter | Type | Notes |
| --- | --- | --- |
| `query` | string | Required. |
| `page` | int 1–100 | Optional, defaults to 1. Enables pagination. |

Returns an array of records:

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | Always present. |
| `url` | string | Always present. |
| `snippet` | string | Omitted when the plugin's `includeSnippets` toggle is off. |
| `date` | string | ISO 8601 publication/modification date extracted from the result page (prefers `article:modified_time` over `article:published_time`); omitted when extraction yields nothing. |
| `type` | string | OpenGraph `og:type` from the result page; omitted when extraction yields nothing. |
| `description` | string | Page meta description (clamped to ~500 chars); omitted when extraction yields nothing. |

Each fresh result page is fetched again through the website cache and run through `metascraper` to populate `date`, `type`, and `description`. The per-result fan-out runs concurrently across distinct hosts via a per-host rate limiter, so a 10-result enrichment pass costs roughly one fetch's wall-time rather than ten. Per-result failures silently fall back to the unenriched shape rather than aborting the search; non-HTML pages (PDF, plain text, JSON) come back without metadata. The post-enrichment payload is what gets cached under the `search-enriched` cache subdir, so warm queries skip both the DuckDuckGo fetch and the fan-out.

Cache key: `(query, safeSearch, page, enrichResults)`. Results-per-page cap, snippet inclusion, enrichment, and safe-search mode are all plugin-only settings — none are exposed as tool parameters so the model cannot override the user-set values.

### Image Search

DuckDuckGo image search. Requires a VQD token scraped from the DuckDuckGo homepage.

| Parameter | Type | Notes |
| --- | --- | --- |
| `query` | string | Required. |
| `page` | int 1–100 | Optional, defaults to 1. |

Matching images are downloaded into the chat's working directory and returned as local file paths. If a download fails, the remote URL is returned for that slot instead so the assistant always gets something displayable. The results-per-page cap is controlled by the plugin's `limitImageResults` toggle and `imageMaxResults` slider (default 10, max 100) — these are plugin-only settings and are not exposed as tool parameters. Disabling `limitImageResults` returns every image DuckDuckGo includes on the page. Safe-search mode is plugin-only (default moderate).

### Visit Website

Fetches a URL and returns its title, first-level headings (`h1`/`h2`/`h3`), and a readable content excerpt produced by `@mozilla/readability`. The content is returned as Markdown by default — headings, lists, inline links, and inline images are preserved — or as plain text when the plugin's `contentFormat` setting is switched to `"text"`. Use the View Images tool to download any images of interest.

| Parameter | Type | Notes |
| --- | --- | --- |
| `url` | URL | Required. |
| `findInPage` | string[] | Optional search terms that bias which content slices are returned when the page exceeds the character budget. Strongly recommended. |

The visible-text character budget (`contentLimit`), the output format (`contentFormat`), and the maximum HTML payload size (`maxResponseMb`) are all plugin-only settings — they are not exposed as tool parameters so the model cannot override the user-set or default values. The response includes `contentLength`, the character count of the full extracted content prior to truncation. When `contentLength > content.length` the content was truncated — refine `findInPage` and re-call, or raise `contentLimit` in the plugin settings.

### View Images

Downloads images from an explicit URL list, from images scraped off a page, or both. Provide at least one of `imageURLs` or `websiteURL`.

| Parameter | Type | Notes |
| --- | --- | --- |
| `imageURLs` | URL[] | Optional explicit list to download. |
| `websiteURL` | URL | Optional page to scrape for images. |
| `maxImages` | int 1–200 | Optional; caps how many scraped images are downloaded when `websiteURL` is supplied. |

Returns an array of per-image records:

```json
{
  "filename": "typescript.svg",
  "alt": "TypeScript logo",
  "title": "Click to enlarge",
  "image": "![TypeScript logo](path/to/download)"
}
```

When a download fails, the record carries an `error` field in place of `image`. `alt` and `title` are populated from the source page's `<img>` attributes when images are scraped via `websiteURL`; explicit `imageURLs` arrive without that metadata and surface both fields as empty strings.

## Installation

### From the LM Studio Hub

Install the plugin through LM Studio's plugin browser. Once enabled, the four tools become available to any model that supports tool calls.

### Local development

Requires **Node.js ≥ 22** (for `fetch` and `AbortSignal.any`).

```bash
git clone https://github.com/packern/web-tools.git
cd web-tools
npm install
npm run dev    # runs `lms dev`
```

`npm run push` publishes the plugin to the LM Studio Hub (`lms push`).

## Configuration

All fields are exposed in the LM Studio plugin UI. The Safe Search field accepts an **Auto** sentinel that resolves to `moderate`. For numeric fields where "disabled" is meaningful (cache TTLs, request interval, retry count, request delay), **`0` disables the behavior** — see the Notes column.

### Safe search and result shape

| Field | Range | Default | Purpose |
| --- | --- | --- | --- |
| Safe Search | strict / moderate / off / Auto | Auto → `moderate` | DuckDuckGo safe-search mode applied to web and image search. |
| Web Search: Include Result Snippets | on/off | on | Include the short DuckDuckGo-rendered preview snippet alongside title and URL. |
| Web Search: Enrich Results | on/off | on | Fetch each result page and extract publication date, OpenGraph type, and description. Disable to skip the per-result fan-out and return only title, URL, and snippet. |

### Result counts

| Field | Range | Default | Purpose |
| --- | --- | --- | --- |
| Web Search: Limit Results | on/off | on | When off, every result on the requested page is included (≈30 from DuckDuckGo). |
| Web Search: Max Results | 1–30 | 10 | Cap when limiting is on. |
| Image Search: Limit Results | on/off | on | When off, every image on the requested page is included (≈100 from DuckDuckGo). |
| Image Search: Max Results | 1–100 | 10 | Cap when limiting is on. |
| View Images: Max Images | 1–200 | 10 | Maximum images scraped when View Images receives a `websiteURL`. |

### Visit Website content

| Field | Range | Default | Purpose |
| --- | --- | --- | --- |
| Visit Website: Content Format | Markdown / Plain text | Markdown | Output format of the `content` field. Markdown retains headings, lists, and inline links; Plain text strips syntax and preserves only line breaks. |
| Visit Website: Content Character Limit | 1000–100 000 | 10 000 | Visible-text character budget for the page excerpt. |
| Visit Website: Max Response Size (MB) | 1–100 | 5 | Caps the HTML payload fetched. |

### Image payloads

| Field | Range | Default | Purpose |
| --- | --- | --- | --- |
| Max Image Size (MB) | 1–100 | 10 | Caps per-image payload for Image Search and View Images. |

### Cache TTLs

| Field | Range | Default | Purpose |
| --- | --- | --- | --- |
| Search Cache TTL (s) | 0–3600 | 900 (15 min) | How long enriched search payloads stay cached. `0` disables. |
| Image Search Token Cache TTL (s) | 0–3600 | 600 (10 min) | How long DuckDuckGo VQD tokens stay cached. `0` disables. |
| Website Cache TTL (s) | 0–3600 | 600 (10 min) | How long fetched HTML stays cached. `0` disables. |

### Request pacing and retry

| Field | Range | Default | Purpose |
| --- | --- | --- | --- |
| Min Interval Between Requests (s) | 0–30 | 5 | Minimum gap between outbound DuckDuckGo requests; `0` disables. |
| Image Search: Request Delay (s) | 0–10 | 2 | Delay inserted before the image-search API call (after the VQD scrape). `0` disables. |
| Max Retries Per Request | 0–4 | 2 | Retry attempts after the first try; `0` disables. |
| Retry Initial Backoff (s) | 0–30 | 1 | Base backoff before the first retry. |
| Retry Max Backoff (s) | 0–300 | 30 | Upper bound on exponential-backoff delay. |

## Caching

Three disk-backed [`cacache`](https://www.npmjs.com/package/cacache) stores, all persisted under `~/.lmstudio/plugin-data/lms-plugin-duckduckgo-cache/`:

- **Search results** (subdir `search-enriched`) — up to 100 entries, default TTL 15 minutes (`searchCacheTtlSeconds`). Stores the post-enrichment payload, so warm queries skip both the DuckDuckGo fetch and the per-result fan-out.
- **Image-search VQD tokens** (subdir `vqd`) — up to 50 entries, default TTL 10 minutes (`imageSearchTokenCacheTtlSeconds`).
- **Website HTML** (subdir `website`) — up to 50 entries, default TTL 10 minutes (`websiteCacheTtlSeconds`). Shared by Visit Website, View Images, and the Web Search enrichment pass.

Caches survive plugin reloads. To fully clear them, stop LM Studio and delete the cache directory above.

## Rate limiting and retry

A shared [`bottleneck`](https://www.npmjs.com/package/bottleneck)-backed rate limiter enforces a 5-second minimum gap between outbound DuckDuckGo requests by default for the single-target flows (web search itself, Visit Website, image downloads). The Web Search enrichment fan-out instead uses a per-host limiter keyed on URL host, so requests to distinct domains run in parallel while same-host requests still observe the interval — a 10-result enrichment pass costs roughly one fetch's wall-time rather than ten.

Every outbound HTTP request is wrapped by [`p-retry`](https://www.npmjs.com/package/p-retry) with randomized exponential backoff (factor 2) — 3 retry attempts (after the first try) with a 1-second base and 30-second cap by default. Set the interval or retry count to `0` to disable either behavior.

## Usage

With the plugin enabled you can explicitly ask the assistant to search the web, fetch images, visit a page, or view images, but you can also just ask a question whose answer requires the web and the assistant will pick the right tool on its own.

## Development scripts

- `npm run dev` — run the plugin in LM Studio dev mode (`lms dev`).
- `npm run push` — publish to the LM Studio Hub (`lms push`).
- `npm run lint` / `npm run lint:fix` — ESLint on `src/**/*.ts`.
- `npm run format` / `npm run format:check` — Prettier.
- `npm run knip` — dead-code / unused-export check.

A local pre-commit hook at `.git/hooks/pre-commit` can run `lint`, `format:check`, and `knip` sequentially and abort the commit on any failure. The hook is **not** committed to the repo — fresh clones need to reinstall it. Bypass with `git commit --no-verify` when necessary.

No test suite is configured.

## Credits

Built on top of Daniel Sig's original
[lms-plugin-duckduckgo](https://github.com/danielsig/lms-plugin-duckduckgo) and
[lms-plugin-visit-website](https://github.com/danielsig/lms-plugin-visit-website) plugins, now
merged into a single tool suite and extended with the View Images tool, Markdown-formatted
website content, `findInPage`-biased content slicing, configurable rate limiting and retry,
and a persistent `cacache`-backed store for VQD tokens, search results, and fetched HTML.

## License

MIT — see [LICENSE](LICENSE).
