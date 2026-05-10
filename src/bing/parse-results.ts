/**
 * Parses image-tile metadata out of a Bing image-search results page.
 */

import { JSDOM } from "jsdom"

import { hasSupportedImageExtension } from "../parsers/image-extensions"

/**
 * Shape of the JSON object Bing serialises into each `<a class="iusc">` tile's `m` attribute.
 * Only the fields the plugin consumes are typed; Bing returns several others (`cid`, `mid`,
 * `md5`, `shkey`, `sid`, `cturl`, `turl`, `desc`) that are ignored here.
 */
interface BingImageTile {
  /** Direct URL to the full-resolution source image. */
  murl?: string
  /** URL of the page hosting the image. */
  purl?: string
  /** Human-readable image title rendered by Bing. */
  t?: string
}

/**
 * Single image record extracted from Bing's image-search HTML.
 */
export interface BingImageResult {
  /** Direct URL to the full-resolution source image. */
  image: string
  /** Human-readable title surfaced by Bing for the image, when present. */
  title?: string
  /** URL of the page hosting the image, when present. */
  sourcePage?: string
}

/**
 * Extract every image record from a Bing image-search results page. Filters out tiles whose
 * source URL does not end in a supported image extension and deduplicates by URL.
 *
 * @param html Raw HTML payload returned by Bing's image-search endpoint.
 * @returns Deduplicated list of image records, in the order Bing rendered them.
 */
export function parseBingImageResults(html: string): BingImageResult[] {
  const { window } = new JSDOM(html)
  const tiles = window.document.querySelectorAll("a.iusc[m]")
  const seen = new Set<string>()
  const results: BingImageResult[] = []

  for (const tile of tiles) {
    const raw = tile.getAttribute("m")

    if (raw === null) {
      continue
    }

    const parsed = parseTile(raw)

    if (parsed === undefined) {
      continue
    }

    const { murl } = parsed

    if (murl === undefined || !hasSupportedImageExtension(murl) || seen.has(murl)) {
      continue
    }

    seen.add(murl)
    results.push(buildResult(murl, parsed))
  }

  return results
}

/**
 * Parse the JSON blob serialised into a tile's `m` attribute, returning `undefined` when
 * the payload is malformed rather than throwing — Bing has historically shipped occasional
 * non-tile elements that share the `iusc` class, and a single bad tile must not abort the
 * full result list.
 *
 * @param raw Raw attribute value as returned by `Element.getAttribute` (already entity-decoded by jsdom).
 * @returns The parsed tile object, or `undefined` when parsing fails.
 */
function parseTile(raw: string): BingImageTile | undefined {
  try {
    return JSON.parse(raw) as BingImageTile
  } catch {
    return undefined
  }
}

/**
 * Assemble a `BingImageResult` from a parsed tile, omitting optional fields that are
 * empty so the per-result merge in the tool layer never surfaces blank metadata.
 *
 * @param image Source image URL extracted from the tile.
 * @param tile Parsed tile object carrying the optional title and source-page fields.
 * @returns A `BingImageResult` with `title` and `sourcePage` populated only when present.
 */
function buildResult(image: string, tile: BingImageTile): BingImageResult {
  const result: BingImageResult = { image }

  if (typeof tile.t === "string" && tile.t.length > 0) {
    result.title = tile.t
  }

  if (typeof tile.purl === "string" && tile.purl.length > 0) {
    result.sourcePage = tile.purl
  }

  return result
}
