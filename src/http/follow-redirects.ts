/**
 * Manual redirect-following primitive shared by all `impit` GET entry points. Each hop is
 * re-validated through the SSRF guard so DNS rebinding and redirect-to-internal cannot be
 * used to bypass the destination allowlist.
 */

import { errorMessage, isAbortError } from "../errors"

import { FetchError } from "./fetch-error"
import { translateImpitError } from "./translate-impit-error"
import { assertPublicUrl } from "./url-guard"

import type { Impit, ImpitResponse } from "impit"

/**
 * Default maximum number of redirect hops to follow before throwing.
 */
const DEFAULT_MAX_REDIRECT_HOPS = 10

/**
 * Lower bound of HTTP redirect status codes.
 */
const HTTP_REDIRECT_MIN = 300

/**
 * Upper bound (exclusive) of HTTP redirect status codes.
 */
const HTTP_REDIRECT_MAX_EXCLUSIVE = 400

/**
 * HTTP status code for `Not Modified`, which shares the 3xx range but is not a redirect.
 */
const HTTP_NOT_MODIFIED = 304

/**
 * Response header Cloudflare sets when its WAF takes mitigation action on a request.
 * `cf-mitigated: challenge` accompanies a `403` whose body is a JS challenge page
 * ("Just a moment..."); these are non-deterministic and worth retrying since the same
 * fingerprint may pass on a subsequent attempt.
 */
const CF_MITIGATED_HEADER = "cf-mitigated"

/**
 * Value of the `cf-mitigated` header indicating a transient JS challenge — the only
 * mitigation kind we treat as retryable. Other values (`block`, `dns_filtering`) reflect
 * deliberate site rules and should fail fast.
 */
const CF_MITIGATED_CHALLENGE_VALUE = "challenge"

/**
 * Options controlling a single redirect-following GET chain.
 */
export interface FollowRedirectsOptions {
  /** External abort signal used to discriminate user-aborts from chain-wide timeouts. */
  signal: AbortSignal

  /**
   * Signal passed to the underlying `impit.fetch` call. When omitted, `signal` is used.
   * Callers wanting a chain-wide timeout combine `signal` with a timeout signal here while
   * leaving `signal` itself unaffected, so a fired-but-not-user-aborted signal can be
   * recognised as a timeout via `timeoutMessage`.
   */
  fetchSignal?: AbortSignal

  /**
   * Message used when an abort fires on `fetchSignal` while `signal` itself was never aborted.
   * When set, the abort is rethrown as a `FetchError` carrying this message and the original
   * URL, with the underlying abort attached as `cause`. When unset, abort errors propagate.
   */
  timeoutMessage?: string

  /** Extra request headers layered onto the `impit` browser-impersonation defaults on every hop. */
  headers?: Record<string, string>

  /** Maximum number of redirect hops to follow before throwing. Defaults to 10. */
  maxHops?: number
}

/**
 * Result of a single redirect-handling hop, indicating either a final response or the next URL to follow.
 */
type HopResult =
  | {
      /** Discriminant marking a final (non-redirect) response. */
      kind: "done"

      /** The fully received response to return to the caller. */
      response: ImpitResponse
    }
  | {
      /** Discriminant marking a redirect that should be followed. */
      kind: "redirect"

      /** Value of the `Location` header, resolved against the current URL by the caller. */
      location: string
    }

/**
 * Issue a GET against `url`, manually following redirects and re-validating the SSRF guard on
 * every hop, until a non-redirect response is returned or the hop budget is exhausted. Transport
 * failures are normalised into `FetchError`. Aborts caused by `options.fetchSignal` firing while
 * `options.signal` did not are rethrown as a `FetchError` carrying `options.timeoutMessage` when
 * that field is set.
 *
 * @param impit - Shared HTTP client used for the request.
 * @param url - Target URL to fetch.
 * @param options - Options controlling the request, headers, abort handling, and hop budget.
 * @returns The successful (non-redirect) response.
 * @throws Whenthe transport fails, the response is non-2xx, the redirect budget
 * is exhausted, or `fetchSignal` aborts while `signal` did not and `timeoutMessage` is set.
 */
export async function followRedirects(
  impit: Impit,
  url: string,
  options: FollowRedirectsOptions
): Promise<ImpitResponse> {
  return followFromHop(impit, url, url, options, options.maxHops ?? DEFAULT_MAX_REDIRECT_HOPS)
}

/**
 * Recursively issue a GET against `currentUrl`, re-validating the SSRF guard on every hop,
 * until a non-redirect response is returned or the hop budget is exhausted.
 *
 * @param impit - Shared HTTP client used for the request.
 * @param originalUrl - URL originally requested by the caller, used in the "too many redirects" error and timeout message.
 * @param currentUrl - URL to fetch in this attempt.
 * @param options - Options controlling the request, headers, and abort handling.
 * @param hopsRemaining - Number of redirect hops still permitted before aborting.
 * @returns The successful response.
 */
async function followFromHop(
  impit: Impit,
  originalUrl: string,
  currentUrl: string,
  options: FollowRedirectsOptions,
  hopsRemaining: number
): Promise<ImpitResponse> {
  await assertPublicUrl(currentUrl)
  const hop = await performHop(impit, originalUrl, currentUrl, options)

  if (hop.kind === "done") {
    return hop.response
  }

  if (hopsRemaining <= 0) {
    throw new FetchError("Too many redirects", undefined, originalUrl)
  }

  const nextUrl = new URL(hop.location, currentUrl).toString()

  return followFromHop(impit, originalUrl, nextUrl, options, hopsRemaining - 1)
}

/**
 * Issue a single GET and classify the response as either a final success or a redirect instruction.
 *
 * @param impit - Shared HTTP client used for the request.
 * @param originalUrl - URL originally requested by the caller, used as the `url` on timeout errors.
 * @param currentUrl - URL to fetch in this hop.
 * @param options - Options controlling the request, headers, and abort handling.
 * @returns A `done` result carrying the final response, or a `redirect` result carrying the next `Location`.
 */
async function performHop(
  impit: Impit,
  originalUrl: string,
  currentUrl: string,
  options: FollowRedirectsOptions
): Promise<HopResult> {
  const fetchSignal = options.fetchSignal ?? options.signal
  let response: ImpitResponse

  try {
    response = await impit.fetch(currentUrl, {
      method: "GET",
      signal: fetchSignal,
      redirect: "manual",
      headers: options.headers,
    })
  } catch (error) {
    throw translateTransportError(error, originalUrl, currentUrl, options)
  }

  if (isRedirectStatus(response.status)) {
    const location = response.headers.get("location")

    if (location === null || location === "") {
      throw new FetchError("Redirect missing Location header", response.status, currentUrl)
    }

    return { kind: "redirect", location }
  }

  if (!response.ok) {
    throw new FetchError(`HTTP ${response.status} ${response.statusText}`, response.status, currentUrl, {
      retryable: isCloudflareChallenge(response) ? true : undefined,
    })
  }

  return { kind: "done", response }
}

/**
 * Detect a Cloudflare JS-challenge response, identified by the `cf-mitigated: challenge`
 * header Cloudflare sets alongside the `403`. The challenge is non-deterministic — the
 * same fingerprint that gets challenged once may pass on retry — so the underlying
 * `FetchError` is flagged retryable and `withRetry` will give it another attempt under
 * the configured backoff.
 *
 * @param response - Response to inspect.
 * @returns `true` when the response is a Cloudflare JS challenge.
 */
function isCloudflareChallenge(response: ImpitResponse): boolean {
  return response.headers.get(CF_MITIGATED_HEADER) === CF_MITIGATED_CHALLENGE_VALUE
}

/**
 * Map a transport-level error from `impit.fetch` into either a propagated abort, a `FetchError`
 * representing a chain-wide timeout, or a `FetchError` describing the underlying transport failure.
 * Known impit/reqwest debug-repr shapes are translated into short human-readable summaries via
 * `translateImpitError`; when translation matches, the original cryptic error is dropped from
 * `cause` so it cannot be reintroduced by the tool-error formatter's cause suffix.
 *
 * @param error - Thrown value caught from the `impit.fetch` call.
 * @param originalUrl - URL originally requested by the caller, attached to timeout errors.
 * @param currentUrl - URL fetched in the current hop, attached to non-timeout transport errors.
 * @param options - Options carrying the user signal and optional `timeoutMessage`.
 * @returns The error to throw — either the original abort or a `FetchError`.
 */
function translateTransportError(
  error: unknown,
  originalUrl: string,
  currentUrl: string,
  options: FollowRedirectsOptions
): unknown {
  if (isAbortError(error)) {
    if (options.timeoutMessage !== undefined && !options.signal.aborted) {
      return new FetchError(options.timeoutMessage, undefined, originalUrl, { cause: error })
    }

    return error
  }

  const translated = translateImpitError(error)
  const message = translated?.summary ?? errorMessage(error)
  const cause = translated === undefined ? error : undefined

  return new FetchError(`Request failed: ${message}`, undefined, currentUrl, {
    cause,
    retryable: translated?.retryable,
  })
}

/**
 * Determine whether an HTTP status code represents a followable redirect response.
 *
 * @param status - HTTP status code to classify.
 * @returns `true` when the status is in the 3xx range excluding `304 Not Modified`.
 */
function isRedirectStatus(status: number): boolean {
  return status >= HTTP_REDIRECT_MIN && status < HTTP_REDIRECT_MAX_EXCLUSIVE && status !== HTTP_NOT_MODIFIED
}
