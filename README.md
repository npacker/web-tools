# Web Tools Plugin for LM Studio

An LM Studio plugin that gives local LLMs four web-oriented tools:

- **Web Search** — DuckDuckGo web search returning ranked `[title, url]` pairs.
- **Image Search** — DuckDuckGo image search; matching images are downloaded to the working directory so the assistant can display them.
- **Visit Website** — fetches a URL and returns its title, headings, links, downloaded images, and a search-term-aware slice of its visible text.
- **View Images** — downloads images from a list of URLs and/or scraped from a page so the assistant can display them.

## Configuration

![Web Tools Plugin Configuration](/docs/assets/configuration.png)

- **Search Results Per Page** — maximum number of web/image search results per page. Leave at 0 to let the assistant decide.
- **Safe Search** — `off`, `moderate`, or `strict`. Leave at `Auto` to let the assistant decide.
- **Max Links / Max Images / Content Limit** — per-call caps exposed to the Visit Website tool.

## How to use

With the plugin enabled you can explicitly ask the assistant to search the web, fetch images, visit a page, or view images, but you can also just ask a question whose answer requires the web and the assistant will call the right tool on its own. Web and image search support pagination; Visit Website accepts optional `findInPage` terms that bias which links, images, and text are returned.

## Credits

Built on top of Daniel Sig's original
[lms-plugin-duckduckgo](https://github.com/danielsig/lms-plugin-duckduckgo) and
[lms-plugin-visit-website](https://github.com/danielsig/lms-plugin-visit-website) plugins, now
merged into a single tool suite and extended with the View Images tool and a persistent
`cacache`-backed store for VQD tokens, search results, and fetched HTML.

## License

MIT — see [LICENSE](LICENSE).
