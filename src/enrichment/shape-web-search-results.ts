/**
 * Output shaping for web search results. Strips the `snippet` field from each record when
 * snippets have been disabled in plugin config, leaving every other enrichment field in
 * place. Lives outside `src/tools/` so the web-search tool factory can keep to the
 * single-`create*Tool` convention.
 */

import type { WebSearchResult } from "../cache"

/**
 * Strip `snippet` from every record when `includeSnippets` is `false`. The cache always
 * stores the snippet so toggling the setting takes effect on the next read without
 * re-running the search.
 *
 * @param results Result records being prepared for the tool response.
 * @param includeSnippets Resolved plugin setting controlling snippet inclusion.
 * @returns Records with `snippet` removed when `includeSnippets` is `false`, otherwise unchanged.
 */
export function shapeWebSearchResults(results: WebSearchResult[], includeSnippets: boolean): WebSearchResult[] {
  if (includeSnippets) {
    return results
  }

  return results.map(({ snippet: _snippet, ...rest }) => rest)
}
