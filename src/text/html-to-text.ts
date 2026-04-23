/**
 * HTML to plain-text conversion that preserves block-level line breaks but drops
 * all markdown syntax. Used by the Visit Website tool when the caller opts out of markdown.
 */

import { convert } from "html-to-text"

import { normalizeBlankLines } from "./normalize-blank-lines"

import type { HtmlToTextOptions } from "html-to-text"

/**
 * Converter options tuned for token efficiency: word wrapping is disabled so paragraphs are not
 * fragmented across lines, anchors render only their inner text (the URL is dropped), images and
 * `<noscript>`/`<template>` subtrees are excluded entirely, headings and table headers retain
 * their original case instead of being uppercased, and list items use a two-character prefix.
 *
 * @const {HtmlToTextOptions}
 */
const CONVERT_OPTIONS: HtmlToTextOptions = {
  wordwrap: false,
  selectors: [
    { selector: "a", options: { ignoreHref: true } },
    { selector: "img", format: "skip" },
    { selector: "noscript", format: "skip" },
    { selector: "template", format: "skip" },
    { selector: "h1", options: { uppercase: false } },
    { selector: "h2", options: { uppercase: false } },
    { selector: "h3", options: { uppercase: false } },
    { selector: "h4", options: { uppercase: false } },
    { selector: "h5", options: { uppercase: false } },
    { selector: "h6", options: { uppercase: false } },
    { selector: "ul", options: { itemPrefix: "- " } },
    { selector: "table", options: { uppercaseHeaderCells: false } },
  ],
}

/**
 * Convert an HTML fragment to plain text via the `html-to-text` package, then collapse runs of
 * blank lines and trim trailing whitespace.
 *
 * @param html HTML fragment to convert.
 * @returns The plain-text representation, with runs of blank lines collapsed and trailing whitespace trimmed.
 */
export function htmlToText(html: string): string {
  return normalizeBlankLines(convert(html, CONVERT_OPTIONS))
}
