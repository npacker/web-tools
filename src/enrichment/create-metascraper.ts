/**
 * Construct a shared `metascraper` instance that extracts the three meta fields used to
 * enrich web search results: a single page date (the most recent of `article:modified_time`
 * or `article:published_time`), the OpenGraph content type, and a short page description.
 * Rules use `@metascraper/helpers` for JSON-LD lookups (memoized via `$jsonld`), date
 * normalization (chrono-node-backed `date()`), and description truncation, so we inherit
 * official metascraper behaviour without pulling each per-field plugin package. Keys with
 * no extracted value are omitted from the returned object so callers can spread without
 * polluting the target with `undefined` properties.
 */

import { $jsonld, date, description } from "@metascraper/helpers"
import metascraperFactory from "metascraper"

import type { Metascraper, Rules, RulesOptions, RulesTestOptions } from "metascraper"

/**
 * Subset of metascraper's metadata that this plugin populates.
 */
export interface EnrichmentMetadata {
  /** ISO 8601 page date — most recent of `article:modified_time` or `article:published_time`. */
  date?: string
  /** OpenGraph `og:type` value (for example `article`, `website`, `video.other`). */
  type?: string
  /** Short page description sourced from OpenGraph, standard meta, or JSON-LD. */
  description?: string
}

/**
 * Inputs accepted by the bound metascraper instance.
 */
export interface ScrapeInput {
  /** Raw HTML body of the page being scraped. */
  html: string
  /** URL the HTML was retrieved from; used by metascraper for relative-link resolution. */
  url: string
}

/**
 * Function signature exposed by `createMetascraper`: takes the page HTML and its URL and
 * resolves to the three extracted fields.
 */
export type ScrapeEnrichmentMetadata = (input: ScrapeInput) => Promise<EnrichmentMetadata>

/**
 * Options passed to every `helpers.description` call. The truncation cap keeps the per-result
 * payload bounded when sites embed very long descriptions in OpenGraph or JSON-LD.
 *
 * @const {{ truncateLength: number }}
 */
const DESCRIPTION_OPTIONS = { truncateLength: 500 } as const

/**
 * Keys this plugin emits onto each enriched record. Drives the projection from metascraper's
 * looser `Metadata` shape into our narrower `EnrichmentMetadata` so adding or removing a
 * field here automatically updates both the type and the runtime filter.
 *
 * @const {readonly (keyof EnrichmentMetadata)[]}
 */
const ENRICHMENT_KEYS = ["date", "type", "description"] as const

/**
 * Build the shared metascraper instance used for search-result enrichment. The wrapper
 * filters out keys whose values are `undefined` so the returned object can be merged via
 * spread without polluting the target with `undefined` properties.
 *
 * @returns A scrape function that extracts the three enrichment fields from a page.
 */
export function createMetascraper(): ScrapeEnrichmentMetadata {
  const scraper: Metascraper = metascraperFactory([buildEnrichmentRules()])

  return async ({ html, url }) => {
    const metadata = await scraper({ html, url })
    const enrichment: EnrichmentMetadata = {}

    for (const key of ENRICHMENT_KEYS) {
      const value = metadata[key]

      if (value !== undefined) {
        enrichment[key] = value
      }
    }

    return enrichment
  }
}

/**
 * Construct the single-plugin rule bundle. The `date` chain prefers the modified time over
 * the published time so the model sees the most recent change date; each entry is normalized
 * via `@metascraper/helpers.date` (chrono-node-backed) for robust format handling. JSON-LD
 * lookups go through the memoized `$jsonld` helper so multiple property accesses on the same
 * page reuse a single parse pass.
 *
 * @returns Rule bundle suitable for passing to the `metascraper` factory.
 */
function buildEnrichmentRules(): Rules {
  return {
    pkgName: "lms-plugin-web-tools-enrichment",
    date: [
      dateRule(metaContent('meta[property="article:modified_time"]')),
      dateRule(metaContent('meta[itemprop="dateModified"]')),
      dateRule($jsonld("dateModified")),
      dateRule(metaContent('meta[property="article:published_time"]')),
      dateRule(metaContent('meta[itemprop="datePublished"]')),
      dateRule($jsonld("datePublished")),
      dateRule(metaContent('meta[name="date"]')),
    ],
    type: [({ htmlDom: $ }) => trimmed($('meta[property="og:type"]').attr("content"))],
    description: [
      descriptionRule(metaContent('meta[property="og:description"]')),
      descriptionRule(metaContent('meta[name="description"]')),
      descriptionRule($jsonld("description")),
      descriptionRule(metaContent('meta[name="twitter:description"]')),
    ],
  }
}

/**
 * Cheerio root passed into each metascraper rule. Sourced via metascraper's typed surface
 * so cheerio is not imported as a direct dependency.
 */
type CheerioRoot = RulesTestOptions["htmlDom"]

/**
 * Pulls a single candidate value out of the cheerio root for one rule chain entry. Mirrors
 * the shape `helpers.$jsonld(propName)` returns so JSON-LD lookups slot in directly
 * alongside DOM-selector extractors.
 */
type Extractor = (dom: CheerioRoot) => unknown

/**
 * Build an extractor that reads `selector`'s `content` attribute from the cheerio root.
 *
 * @param selector CSS selector matching a `<meta>` element.
 * @returns Extractor returning the matched element's `content` attribute, or `undefined`.
 */
function metaContent(selector: string): Extractor {
  return $ => $(selector).attr("content")
}

/**
 * Wrap an extractor so its raw output flows through `helpers.date` for ISO 8601 normalization.
 *
 * @param extract Extractor producing the raw date candidate.
 * @returns A metascraper rule yielding an ISO 8601 timestamp or `undefined`.
 */
function dateRule(extract: Extractor): RulesOptions {
  return ({ htmlDom }) => date(extract(htmlDom))
}

/**
 * Wrap an extractor so its raw output flows through `helpers.description` with the shared
 * truncation cap.
 *
 * @param extract Extractor producing the raw description candidate.
 * @returns A metascraper rule yielding a bounded description or `undefined`.
 */
function descriptionRule(extract: Extractor): RulesOptions {
  return ({ htmlDom }) => description(extract(htmlDom), DESCRIPTION_OPTIONS)
}

/**
 * Trim a candidate string and discard empty results so metascraper can keep searching the
 * rule chain. Used for `og:type` since `@metascraper/helpers` does not expose a generic
 * string sanitizer.
 *
 * @param value Raw attribute value, or `undefined` when the selector did not match.
 * @returns The trimmed string, or `undefined` when the trimmed value is empty.
 */
function trimmed(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const collapsed = value.trim()

  return collapsed === "" ? undefined : collapsed
}
