/**
 * Server-side request forgery (SSRF) guard.
 *
 * Rejects destinations that target loopback, RFC 1918 private space, link-local ranges,
 * or cloud metadata addresses before any outbound request is issued. Intended to be
 * invoked against both the original URL and every redirect hop so DNS rebinding and
 * redirect-to-internal cannot bypass the check.
 */

import dns from "node:dns/promises"
import net from "node:net"

import { FetchError } from "./fetch-error"

import type { LookupAddress } from "node:dns"

/**
 * Number of 16-bit groups in a fully expanded IPv6 address.
 *
 * @const {number}
 * @default
 */
const IPV6_GROUP_COUNT = 8

/**
 * Radix used when parsing IPv6 16-bit groups from their hexadecimal string form.
 *
 * @const {number}
 * @default
 */
const IPV6_PARSE_RADIX = 16

/**
 * Minimum value of a valid 16-bit IPv6 group after parsing.
 *
 * @const {number}
 * @default
 */
const IPV6_GROUP_MIN = 0

/**
 * Maximum value of a valid 16-bit IPv6 group after parsing.
 *
 * @const {number}
 * @default
 */
const IPV6_GROUP_MAX = 0xff_ff

/**
 * Lower bound of the IPv6 unique-local range `fc00::/7`.
 *
 * @const {number}
 * @default
 */
const IPV6_UNIQUE_LOCAL_MIN = 0xfc_00

/**
 * Upper bound of the IPv6 unique-local range `fc00::/7`.
 *
 * @const {number}
 * @default
 */
const IPV6_UNIQUE_LOCAL_MAX = 0xfd_ff

/**
 * Lower bound of the IPv6 link-local range `fe80::/10`.
 *
 * @const {number}
 * @default
 */
const IPV6_LINK_LOCAL_MIN = 0xfe_80

/**
 * Upper bound of the IPv6 link-local range `fe80::/10`.
 *
 * @const {number}
 * @default
 */
const IPV6_LINK_LOCAL_MAX = 0xfe_bf

/**
 * Parse a URL, reject non-HTTP schemes, and reject hostnames that resolve to blocked IP ranges.
 *
 * @param url Target URL to validate before issuing an outbound request.
 * @returns A promise that resolves when the destination is permitted.
 * @throws {FetchError} When the URL is malformed, uses a non-HTTP scheme, or resolves to a blocked IP.
 */
export async function assertPublicUrl(url: string): Promise<void> {
  const hostname = extractHostname(url)
  const literalFamily = net.isIP(hostname)

  if (literalFamily === 4 || literalFamily === 6) {
    if (isBlockedIp(hostname, literalFamily)) {
      throw new FetchError("Destination not allowed: blocked IP", undefined, url)
    }

    return
  }

  const addresses = await resolveHostname(hostname, url)

  for (const address of addresses) {
    const family = address.family === 4 || address.family === 6 ? address.family : undefined

    if (family === undefined) {
      continue
    }

    if (isBlockedIp(address.address, family)) {
      throw new FetchError("Destination not allowed: hostname resolves to blocked IP", undefined, url)
    }
  }
}

/**
 * Determine whether a literal IP address falls in a blocked range.
 *
 * Blocked IPv4 ranges: `0.0.0.0/8`, `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`,
 * `172.16.0.0/12`, `192.168.0.0/16`, and `255.255.255.255/32`.
 *
 * Blocked IPv6 ranges: `::1/128` (loopback), `fc00::/7` (unique local), `fe80::/10`
 * (link-local), and any `::ffff:*` IPv4-mapped address whose embedded IPv4 is blocked.
 *
 * @param address Numeric IP address in canonical textual form (no brackets for IPv6).
 * @param family Address family, `4` for IPv4 or `6` for IPv6.
 * @returns `true` when the address falls in a blocked range.
 */
export function isBlockedIp(address: string, family: 4 | 6): boolean {
  if (family === 4) {
    return isBlockedIpv4(address)
  }

  return isBlockedIpv6(address)
}

/**
 * Parse the URL, enforce the http(s) scheme requirement, and return the bracket-stripped hostname.
 *
 * @param url Target URL to validate.
 * @returns The hostname component, without surrounding IPv6 brackets.
 * @throws {FetchError} When the URL is malformed, uses a non-HTTP scheme, or has an empty hostname.
 */
function extractHostname(url: string): string {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    throw new FetchError("Invalid URL", undefined, url)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FetchError("Destination not allowed: non-HTTP scheme", undefined, url)
  }

  const hostname = stripBrackets(parsed.hostname)

  if (hostname === "") {
    throw new FetchError("Destination not allowed: empty hostname", undefined, url)
  }

  return hostname
}

/**
 * Resolve a hostname to all its A/AAAA records, normalising DNS failures into `FetchError`.
 *
 * @param hostname Hostname component to resolve.
 * @param url Original URL used when composing the error message.
 * @returns The list of resolved addresses.
 * @throws {FetchError} When the DNS lookup fails or returns an empty result.
 */
async function resolveHostname(hostname: string, url: string): Promise<LookupAddress[]> {
  let addresses: LookupAddress[]

  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch (error) {
    throw new FetchError("DNS lookup failed", undefined, url, { cause: error })
  }

  if (addresses.length === 0) {
    throw new FetchError("Destination not allowed: hostname does not resolve", undefined, url)
  }

  return addresses
}

/**
 * Strip surrounding square brackets from an IPv6 hostname as some Node versions
 * return `[::1]` from `URL.hostname` while others return `::1`.
 *
 * @param hostname Hostname possibly wrapped in `[...]`.
 * @returns The hostname without surrounding brackets.
 */
function stripBrackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1)
  }

  return hostname
}

/**
 * Check whether an IPv4 dotted-quad address falls in a blocked range.
 *
 * @param address Dotted-quad IPv4 address.
 * @returns `true` when the address is in a blocked range.
 */
function isBlockedIpv4(address: string): boolean {
  const octets = address.split(".").map(part => Number.parseInt(part, 10))

  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true
  }

  const [first, second, third, fourth] = octets as [number, number, number, number]

  if (first === 0) {
    return true
  }

  if (first === 10) {
    return true
  }

  if (first === 127) {
    return true
  }

  if (first === 169 && second === 254) {
    return true
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return true
  }

  if (first === 192 && second === 168) {
    return true
  }

  if (first === 255 && second === 255 && third === 255 && fourth === 255) {
    return true
  }

  return false
}

/**
 * Check whether an IPv6 address falls in a blocked range, including IPv4-mapped
 * addresses whose embedded IPv4 is itself blocked.
 *
 * @param address Canonical textual IPv6 address (lowercase, no brackets).
 * @returns `true` when the address is in a blocked range.
 */
function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase()
  const mapped = extractMappedIpv4(normalized)

  if (mapped !== undefined) {
    return isBlockedIpv4(mapped)
  }

  const groups = expandIpv6(normalized)

  if (groups === undefined) {
    return true
  }

  if (isIpv6Loopback(groups)) {
    return true
  }

  const firstGroup = groups[0] ?? 0

  if (firstGroup >= IPV6_UNIQUE_LOCAL_MIN && firstGroup <= IPV6_UNIQUE_LOCAL_MAX) {
    return true
  }

  if (firstGroup >= IPV6_LINK_LOCAL_MIN && firstGroup <= IPV6_LINK_LOCAL_MAX) {
    return true
  }

  return false
}

/**
 * Detect an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) and return its embedded IPv4.
 *
 * @param address Lowercase IPv6 address.
 * @returns The embedded IPv4 dotted quad, or `undefined` when the address is not IPv4-mapped.
 */
function extractMappedIpv4(address: string): string | undefined {
  const match = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(address)

  return match?.[1]
}

/**
 * Expand a textual IPv6 address into its eight 16-bit groups, handling the `::` shorthand.
 *
 * @param address Lowercase IPv6 address without brackets.
 * @returns The eight numeric groups, or `undefined` when the address is malformed.
 */
function expandIpv6(address: string): number[] | undefined {
  const doubleColonIndex = address.indexOf("::")
  let groups: string[]

  if (doubleColonIndex === -1) {
    groups = address.split(":")
  } else {
    const head = address.slice(0, doubleColonIndex)
    const tail = address.slice(doubleColonIndex + 2)
    const headGroups = head === "" ? [] : head.split(":")
    const tailGroups = tail === "" ? [] : tail.split(":")
    const missing = IPV6_GROUP_COUNT - headGroups.length - tailGroups.length

    if (missing < 0) {
      return undefined
    }

    groups = [...headGroups, ...Array.from({ length: missing }, () => "0"), ...tailGroups]
  }

  if (groups.length !== IPV6_GROUP_COUNT) {
    return undefined
  }

  const parsed = groups.map(group => Number.parseInt(group, IPV6_PARSE_RADIX))

  if (parsed.some(value => !Number.isInteger(value) || value < IPV6_GROUP_MIN || value > IPV6_GROUP_MAX)) {
    return undefined
  }

  return parsed
}

/**
 * Determine whether an expanded IPv6 address equals `::1` (loopback).
 *
 * @param groups Eight 16-bit groups of the address.
 * @returns `true` when the address is the loopback address.
 */
function isIpv6Loopback(groups: number[]): boolean {
  return groups.slice(0, IPV6_GROUP_COUNT - 1).every(group => group === 0) && groups[IPV6_GROUP_COUNT - 1] === 1
}
