/**
 * HTML to plain-text conversion that preserves block-level line breaks but drops
 * all markdown syntax. Used by the Visit Website tool when the caller opts out of markdown.
 */

import { JSDOM } from "jsdom"

import { normalizeBlankLines } from "./normalize-blank-lines"

import type { DOMWindow } from "jsdom"

/**
 * Element type exposed by a jsdom window, used for the recursive serializer signature. Keeping
 * the type local avoids pulling the global `Element` identifier into lint's scope.
 */
type DomElement = InstanceType<DOMWindow["Element"]>

/**
 * HTML tag names whose content should be surrounded by newlines so adjacent block boundaries
 * survive text extraction. Upper-case matches `Element.tagName` in the HTML namespace.
 *
 * @const {Set<string>}
 */
const BLOCK_TAGS = new Set<string>([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DETAILS",
  "DIALOG",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HGROUP",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "TD",
  "TH",
  "TR",
  "UL",
])

/**
 * HTML tag names whose subtree is excluded from the extracted text.
 *
 * @const {Set<string>}
 */
const SKIP_TAGS = new Set<string>(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"])

/**
 * Convert an HTML fragment to plain text, inserting newlines at block boundaries so headings,
 * paragraphs, and list items remain separated. Scripts, styles, and templates are removed.
 *
 * @param html HTML fragment to convert.
 * @returns The plain-text representation, with runs of blank lines collapsed and trailing whitespace trimmed.
 */
export function htmlToText(html: string): string {
  const { document } = new JSDOM(html).window

  return normalizeBlankLines(serializeElement(document.body))
}

/**
 * Recursively serialize an element subtree into text, wrapping block elements in newlines so
 * adjacent block content does not collide.
 *
 * @param element Element to serialize.
 * @returns The serialized text of the element's subtree.
 */
function serializeElement(element: DomElement): string {
  const { tagName } = element

  if (SKIP_TAGS.has(tagName)) {
    return ""
  }

  if (tagName === "BR") {
    return "\n"
  }

  const pieces: string[] = []

  for (const child of element.childNodes) {
    if (child.nodeType === child.TEXT_NODE) {
      pieces.push(child.textContent ?? "")
    } else if (child.nodeType === child.ELEMENT_NODE) {
      pieces.push(serializeElement(child as DomElement))
    }
  }

  const inner = pieces.join("")

  return BLOCK_TAGS.has(tagName) ? `\n${inner}\n` : inner
}
