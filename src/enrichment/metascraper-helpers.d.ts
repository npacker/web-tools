/* eslint-disable jsdoc/require-jsdoc, unicorn/prevent-abbreviations, @typescript-eslint/consistent-type-imports */

/**
 * Minimal ambient declaration for the subset of `@metascraper/helpers` we use. The package
 * ships pure JS without bundled types, so we declare only the three exports the enrichment
 * plugin consumes (`date`, `description`, `$jsonld`) and reuse metascraper's own typed
 * surface for the cheerio root passed into `$jsonld`. Kept as a script file (no top-level
 * imports) so `declare module` declares a fresh ambient module rather than augmenting one.
 */

declare module "@metascraper/helpers" {
  type CheerioRoot = import("metascraper").RulesTestOptions["htmlDom"]

  export function date(value: unknown): string | undefined

  export function description(value: unknown, opts?: { truncateLength?: number; ellipsis?: string }): string | undefined

  export function $jsonld(propName: string): (dom: CheerioRoot) => unknown
}
