# Web Tools Plugin for LM Studio

An LM Studio plugin that gives local LLMs four web-oriented tools built on `@lmstudio/sdk`. Web and image search are backed by DuckDuckGo (via the browser-fingerprinting [`impit`](https://www.npmjs.com/package/impit) HTTP client), website visits use [`@mozilla/readability`](https://www.npmjs.com/package/@mozilla/readability) for article extraction plus [`turndown`](https://www.npmjs.com/package/turndown) for clean Markdown output, and images referenced by the image-oriented tools are downloaded into the chat's working directory so the assistant can display them inline.

## Tools

### Web Search

DuckDuckGo web search.

| Parameter | Type | Notes |
| --- | --- | --- |
| `query` | string | Required. |
| `safeSearch` | `"strict" \| "moderate" \| "off"` | Optional; overrides plugin setting when supplied. |
| `page` | int 1–100 | Optional, defaults to 1. Enables pagination. |

Returns an array of `[title, url]` pairs. Results are cached by `(query, safeSearch, page)`. The results-per-page count (`pageSize`) is a plugin-only setting — it is not exposed as a tool parameter so the model cannot override the user-set or default value.

### Image Search

DuckDuckGo image search. Requires a VQD token scraped from the DuckDuckGo homepage.

| Parameter | Type | Notes |
| --- | --- | --- |
| `query` | string | Required. |
| `safeSearch` | `"strict" \| "moderate" \| "off"` | Optional; overrides plugin setting. |
| `page` | int 1–100 | Optional, defaults to 1. |

Matching images are downloaded into the chat's working directory and returned as local file paths. If a download fails, the remote URL is returned for that slot instead so the assistant always gets something displayable. The results-per-page count (`pageSize`) is a plugin-only setting — it is not exposed as a tool parameter so the model cannot override the user-set or default value.

### Visit Website

Fetches a URL and returns its title, first-level headings (`h1`/`h2`/`h3`), and a readable content excerpt produced by `@mozilla/readability`. The content is returned as Markdown by default — headings, lists, inline links, and inline images are preserved — or as plain text when the plugin's `contentFormat` setting is switched to `"text"`. Use the View Images tool to download any images of interest.

| Parameter | Type | Notes |
| --- | --- | --- |
| `url` | URL | Required. |
| `findInPage` | string[] | Optional search terms that bias which content slices are returned when the page exceeds the character budget. Strongly recommended. |

Both the visible-text character budget (`contentLimit`) and the output format (`contentFormat`) are plugin-only settings — they are not exposed as tool parameters so the model cannot override the user-set or default values. The response includes `contentLength`, the character count of the full extracted content prior to truncation. When `contentLength > content.length` the content was truncated — refine `findInPage` and re-call, or raise `contentLimit` in the plugin settings.

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

All fields are exposed in the LM Studio plugin UI. Two sentinel conventions apply: **`-1` means "use the built-in default"** and — for the knobs where it makes sense — **`0` means "disabled / no limit / no delay"**.

| Field | Range | Default | Purpose |
| --- | --- | --- | --- |
| Search Results Per Page | 0–10 | `0` → 5 | Page size for web and image search. `0` lets the assistant decide. |
| Safe Search | strict / moderate / off / Auto | Auto → `moderate` | DuckDuckGo safe-search mode. Auto lets the assistant decide. |
| View Images: Max Images | -1–200 | `-1` → 10 | Maximum images scraped when View Images receives a `websiteURL`. |
| Visit Website: Content Character Limit | 0–100 000 | `0` → 10 000 | Visible-text character budget for the page excerpt. |
| Visit Website: Content Format | Markdown / Plain text | Markdown | Output format of the `content` field. Markdown retains headings, lists, and inline links; Plain text strips syntax and preserves only line breaks. |
| Search Cache TTL | -1–3600 s | `-1` → 900 s (15 min) | How long web/image search results stay cached. `0` disables. |
| VQD Token Cache TTL | -1–3600 s | `-1` → 600 s (10 min) | How long DuckDuckGo VQD tokens stay cached. `0` disables. |
| Website Cache TTL | -1–3600 s | `-1` → 600 s (10 min) | How long fetched HTML stays cached. `0` disables. |
| Min Interval Between Requests | -1–30 s | `-1` → 5 s | Minimum gap between outbound DuckDuckGo requests. `0` disables rate limiting. |
| Max Retries Per Request | -1–10 | `-1` → 3 | Retry attempts (after the first try) for every outbound request. `0` disables retries. |
| Retry Initial Backoff | -1–30 s | `-1` → 1 s | Base backoff before the first retry. `0` = no delay. |
| Retry Max Backoff | -1–300 s | `-1` → 30 s | Upper bound on exponential-backoff delay. `0` = no delay. |
| VQD to Image API Delay | -1–10 s | `-1` → 2 s | Delay inserted between the VQD scrape and the image-search API call. `0` = no delay. |

## Caching

Three disk-backed [`cacache`](https://www.npmjs.com/package/cacache) stores, all persisted under `~/.lmstudio/plugin-data/lms-plugin-duckduckgo-cache/`:

- **Search results** — up to 100 entries, default TTL 15 minutes (`searchCacheTtlSeconds`).
- **VQD tokens** — up to 50 entries, default TTL 10 minutes (`vqdCacheTtlSeconds`).
- **Website HTML** — up to 50 entries, default TTL 10 minutes (`websiteCacheTtlSeconds`).

Caches survive plugin reloads. To fully clear them, stop LM Studio and delete the cache directory above.

## Rate limiting and retry

A shared [`bottleneck`](https://www.npmjs.com/package/bottleneck)-backed rate limiter enforces a 5-second minimum gap between outbound DuckDuckGo requests by default. Every outbound HTTP request is wrapped by [`p-retry`](https://www.npmjs.com/package/p-retry) with randomized exponential backoff (factor 2) — three attempts with a 1-second to 30-second window by default. All four knobs are configurable; set the interval or retry count to `0` to disable either behavior.

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
