# Web Tools Plugin for LM Studio

An LM Studio plugin that gives local LLMs four web-oriented capabilities: searching the web, searching for images, visiting a page and reading its content, and downloading images into the chat's working directory so the assistant can embed them inline.

## Key features

- **Bot-resistant HTTP** — outbound requests go through [`impit`](https://www.npmjs.com/package/impit), which applies real-browser TLS fingerprints and request headers for improved bot-detection evasion without the weight or security implications of a full browser stack.
- **SSRF protection** — every outbound URL is validated by [`dssrf`](https://www.npmjs.com/package/dssrf) before the request is issued, rejecting non-HTTP schemes, malformed URLs, and addresses that resolve to private or reserved IP ranges. A randomized double DNS resolution mitigates DNS rebinding.
- **Resilient request pipeline** — disk-backed [`cacache`](https://www.npmjs.com/package/cacache) caching for search results and fetched HTML, a [`bottleneck`](https://www.npmjs.com/package/bottleneck)-backed rate limiter paces outbound requests, and [`p-retry`](https://www.npmjs.com/package/p-retry) wraps every request in randomized exponential backoff.
- **Hard payload caps** — separate per-image and per-page byte limits keep memory exposure bounded when fetching arbitrarily large remote content.
- **Search result enrichment** — web results can be optionally run through [`metascraper`](https://www.npmjs.com/package/metascraper) to surface publication date, OpenGraph type, and description alongside the title and URL, providing useful detail without needing to load the full page into context.
- **Intelligent content extraction** — Visit Website routes HTML through [`@mozilla/readability`](https://www.npmjs.com/package/@mozilla/readability), stripping navigation, sidebars, ads, so the model only sees relevant content.
- **Markdown or plain-text rendering** — Render content as Markdown to strip to plain text, configurable in plugin settings.
- **PDF-to-Markdown** — Visit Website transparently handles PDFs via [`@opendocsg/pdf2md`](https://www.npmjs.com/package/@opendocsg/pdf2md).
- **`findInPage` fuzzy slicing** — when a page is larger than the configured content length, Visit Website slices and returns content based on fuzzy-matched search terms, letting context-constrained models extract useful information from long pages.

## Tools

### Web Search

Runs a query-string search against DuckDuckGo and returns the matching pages — title, URL, and a short snippet for each. Optionally enriches each result with publication date, OpenGraph type, and description pulled from the result page itself; enrichment is on by default but can be disabled in the plugin settings.

| Parameter | Type      | Notes                                        |
| --------- | --------- | -------------------------------------------- |
| `query`   | string    | Required.                                    |
| `page`    | int 1–100 | Optional. Defaults to 1. Enables pagination. |

Returns an array of records:

| Field         | Type   | Notes                                                                                                           |
| ------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `title`       | string |                                                                                                                 |
| `url`         | string |                                                                                                                 |
| `snippet`     | string | Omitted when `Web Search: Include Result Snippets` is off.                                                      |
| `date`        | string | ISO 8601 publication or modification date. Omitted when extraction yields nothing or enrichment is off.         |
| `type`        | string | OpenGraph `og:type`. Omitted when extraction yields nothing or enrichment is off.                               |
| `description` | string | Page meta description, clamped to ~500 characters. Omitted when extraction yields nothing or enrichment is off. |

### Image Search

Runs a query-string search against Bing's image index and returns candidate image URLs along with the page each one was found on. Pair with Fetch Images when the assistant wants to download and embed an image in its reply.

| Parameter | Type      | Notes                    |
| --------- | --------- | ------------------------ |
| `query`   | string    | Required.                |
| `page`    | int 1–100 | Optional. Defaults to 1. |

Returns an array of records:

| Field        | Type   | Notes                                                          |
| ------------ | ------ | -------------------------------------------------------------- |
| `image`      | string | Full-resolution remote URL.                                    |
| `title`      | string | Image title. Omitted when not available.                       |
| `sourcePage` | string | URL of the page hosting the image. Omitted when not available. |

### Visit Website

Fetches a URL and returns its title, top-level headings, and a readable-content excerpt. Handles HTML pages and PDFs (and surfaces plain-text and JSON responses too); the `kind` field on the result tells the assistant which one it got. Content is returned as Markdown by default, or as plain text when `Visit Website: Content Format` is set to plain text.

When a page is longer than the configured character budget, supply the optional `findInPage` parameter — a list of search terms — to bias which slices of the page are returned. This is the primary tool for getting useful answers out of large pages.

| Parameter    | Type     | Notes                                                                                                                                    |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `url`        | URL      | Required.                                                                                                                                |
| `findInPage` | string[] | Optional. Search terms biasing which content slices are returned when the page exceeds the character budget. Recommended on large pages. |

Returns a single record:

| Field           | Type   | Notes                                                                                                                                                      |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`           | string | Echoed back from input.                                                                                                                                    |
| `kind`          | string | One of `html`, `pdf`, `text`, or `json`.                                                                                                                   |
| `mimeType`      | string | MIME type from the server or sniffed from the payload.                                                                                                     |
| `title`         | string | Page title. Omitted when not available.                                                                                                                    |
| `h1`            | string | First `<h1>` element. Omitted for non-HTML kinds or when none is present.                                                                                  |
| `h2`            | string | First `<h2>` element. Omitted for non-HTML kinds or when none is present.                                                                                  |
| `content`       | string | Page content excerpt, truncated to the configured character budget.                                                                                        |
| `contentLength` | number | Pre-truncation character count. When `contentLength > content.length`, refine `findInPage` and re-call, or raise `Visit Website: Content Character Limit`. |

### Fetch Images

Downloads images into the chat's working directory and returns a Markdown reference per image so the assistant can embed them inline. Inputs are HTTP(S) URLs — picks from Image Search, links seen in a Visit Website excerpt, or scraped automatically from a page when `websiteURL` is supplied.

| Parameter    | Type      | Notes                                                                                    |
| ------------ | --------- | ---------------------------------------------------------------------------------------- |
| `imageURLs`  | URL[]     | Optional. Explicit list of HTTP(S) URLs to download.                                     |
| `websiteURL` | URL       | Optional. Page to scrape for `<img>` tags.                                               |
| `maxImages`  | int 1–200 | Optional. Per-call override for the cap on scraped images when `websiteURL` is supplied. |

Returns an array of records:

| Field      | Type   | Notes                                                                                                             |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `filename` | string | Derived from the image's URL.                                                                                     |
| `alt`      | string | Alt text from the source page's `<img>` tag when scraped via `websiteURL`. Empty for explicit `imageURLs`.        |
| `title`    | string | Title attribute from the source page's `<img>` tag when scraped via `websiteURL`. Empty for explicit `imageURLs`. |
| `image`    | string | Markdown image reference (`![alt](localPath)`). Present on success.                                               |
| `error`    | string | Failure message, in place of `image` on download failure.                                                         |

## Installation

### From the LM Studio Hub

Install via the [LM Studio CLI](https://lmstudio.ai/docs/cli):

```bash
lms get npacker/web-tools
```

Or browse to the plugin on the [LM Studio Hub](https://lmstudio.ai/npacker/web-tools) and click "Run in LM Studio." Once enabled, the four tools become available to any model that supports tool calls.

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

All fields are exposed in the LM Studio plugin UI.

### General

| Field               | Range                                                         | Default           | Purpose                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser Fingerprint | Firefox (latest) / Firefox 144 / Chrome (latest) / Chrome 131 | Firefox (latest)  | TLS and header fingerprint impersonated by outbound HTTP requests. The anti-bot layers on DuckDuckGo and Bing require a real browser fingerprint, so this should not be disabled or spoofed to a non-browser. |
| Safe Search         | strict / moderate / off / Auto                                | Auto → `moderate` | Safe-search mode applied to both DuckDuckGo web search and Bing image search.                                                                                                                                 |

### Web Search

| Field                               | Range  | Default | Purpose                                                                                                                                                               |
| ----------------------------------- | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web Search: Include Result Snippets | on/off | on      | Include the short DuckDuckGo-rendered preview snippet alongside title and URL.                                                                                        |
| Web Search: Enrich Results          | on/off | on      | Fetch each result page and extract publication date, OpenGraph type, and description. Disable to skip the per-result fan-out and return only title, URL, and snippet. |
| Web Search: Limit Results           | on/off | on      | When off, every result on the requested page is included (≈30 from DuckDuckGo).                                                                                       |
| Web Search: Max Results             | 1–30   | 10      | Cap when limiting is on.                                                                                                                                              |

### Image Search

| Field                       | Range  | Default | Purpose                                                                  |
| --------------------------- | ------ | ------- | ------------------------------------------------------------------------ |
| Image Search: Limit Results | on/off | on      | When off, every image on the requested page is included (≈35 from Bing). |
| Image Search: Max Results   | 1–35   | 10      | Cap when limiting is on. Max of Bing's natural page size of 35.          |

### Visit Website

| Field                                  | Range                 | Default  | Purpose                                                                                                                                            |
| -------------------------------------- | --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visit Website: Content Format          | Markdown / Plain text | Markdown | Output format of the `content` field. Markdown retains headings, lists, and inline links; Plain text strips syntax and preserves only line breaks. |
| Visit Website: Content Character Limit | 1000–100 000          | 10 000   | Visible-text character budget for the page excerpt.                                                                                                |
| Visit Website: Max Response Size (MB)  | 1–100                 | 5        | Caps fetched HTML payload and the page fetch when Fetch Images scrapes images from a `websiteURL`.                                                 |

### Fetch Images

| Field                    | Range | Default | Purpose                                                                                                               |
| ------------------------ | ----- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| Fetch Images: Max Images | 1–200 | 10      | Maximum images scraped when Fetch Images receives a `websiteURL`. Overridable per call via the `maxImages` parameter. |
| Max Image Size (MB)      | 1–100 | 10      | Caps per-image payload downloaded by Fetch Images.                                                                    |

### Cache TTLs

| Field                 | Range  | Default      | Purpose                                                                                                                                                     |
| --------------------- | ------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search Cache TTL (s)  | 0–3600 | 900 (15 min) | How long enriched web-search payloads stay cached. `0` disables.                                                                                            |
| Website Cache TTL (s) | 0–3600 | 600 (10 min) | How long fetched HTML stays cached. Shared by Visit Website, Fetch Images (when scraping a `websiteURL`), and the Web Search enrichment pass. `0` disables. |

### Request pacing and retry

| Field                             | Range | Default | Purpose                                                                                                                                          |
| --------------------------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Min Interval Between Requests (s) | 0–30  | 5       | Minimum gap between any two outbound HTTP requests (search queries, page fetches, image downloads, per-result enrichment fetches). `0` disables. |
| Max Retries Per Request           | 0–4   | 2       | Retry attempts after the first try, applied to every outbound HTTP request. `0` disables.                                                        |
| Retry Initial Backoff (s)         | 0–30  | 1       | Base backoff before the first retry.                                                                                                             |
| Retry Max Backoff (s)             | 0–300 | 30      | Upper bound on exponential-backoff delay.                                                                                                        |

## Caching

Two disk-backed [`cacache`](https://www.npmjs.com/package/cacache) stores, persisted under `~/.lmstudio/plugin-data/lms-plugin-duckduckgo-cache/`:

- **Web-search results** — up to 100 entries, default TTL 15 minutes (`searchCacheTtlSeconds`). Stores the post-enrichment payload, so warm queries skip both the DuckDuckGo fetch and the per-result fan-out.
- **Website HTML** — up to 50 entries, default TTL 10 minutes (`websiteCacheTtlSeconds`). Shared by Visit Website, Fetch Images, and the Web Search enrichment pass.

Image search is not cached — Bing's response is small and the rate limiter alone caps fetch rate.

Caches survive plugin reloads. To fully clear them, stop LM Studio and delete the cache directory above.

## Rate limiting and retry

A shared [`bottleneck`](https://www.npmjs.com/package/bottleneck)-backed rate limiter enforces a 5-second minimum gap between outbound requests by default for the single-target flows (DuckDuckGo web search, Bing image search, Visit Website, Fetch Images downloads). The Web Search enrichment fan-out instead uses a per-host limiter keyed on URL host, so requests to distinct domains run in parallel while same-host requests still observe the interval — a 10-result enrichment pass costs roughly one fetch's wall-time rather than ten.

Every outbound HTTP request is wrapped by [`p-retry`](https://www.npmjs.com/package/p-retry) with randomized exponential backoff (factor 2) — 2 retry attempts (after the first try) with a 1-second base and 30-second cap by default. Set the interval or retry count to `0` to disable either behavior.

## Usage

With the plugin enabled you can explicitly ask the assistant to search the web, search for images, visit a page, or fetch images, but you can also just ask a question whose answer requires the web and the assistant will pick the right tool on its own. Image displays follow the natural pipeline: Image Search surfaces candidate URLs, Fetch Images downloads the picks into the chat's working directory, and the assistant embeds the returned Markdown references in its reply.

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
merged into a single tool suite and extended with the Fetch Images tool, Markdown-formatted
website content, `findInPage`-biased content slicing, configurable rate limiting and retry,
and a persistent `cacache`-backed store for web-search results and fetched HTML.

## License

MIT — see [LICENSE](LICENSE).
