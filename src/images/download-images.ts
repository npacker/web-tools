/**
 * Concurrent multi-URL image download, preserving input order in the result array.
 */

import { downloadImage } from "./download-image"

import type { RetryHooks, RetryPolicy } from "../http"
import type { Impit } from "impit"

/**
 * Options controlling placement of the downloaded batch.
 */
interface DownloadImagesOptions {
  /** Directory into which downloaded files are written. */
  workingDirectory: string
  /** Epoch-millisecond timestamp used as the filename prefix for every file in the batch. */
  timestamp: number
}

/**
 * Contextual hooks provided by the caller for logging and cancellation.
 */
export interface DownloadImagesContext {
  /** Logger used to surface non-fatal download failures. */
  warn: (message: string) => void
  /** Signal used to abort the in-flight downloads. */
  signal: AbortSignal
  /** Retry policy applied to transient download failures. */
  retry?: RetryPolicy
  /** Hook fired between failed attempts, before the backoff sleep. */
  onRetry?: RetryHooks["onRetry"]
}
/**
 * Per-URL outcome reported by `downloadImages`.
 */
type DownloadedImage =
  | {
      /** Discriminant marking a successful download or passthrough. */
      ok: true
      /** Local filesystem path of the saved (or already-local) image. */
      localPath: string
    }
  | {
      /** Discriminant marking a failed download. */
      ok: false
      /** Original remote URL that could not be fetched. */
      url: string
    }

/**
 * Download every URL in the batch concurrently, preserving the input order in the result array.
 * URLs that already reside inside the working directory, or that are not remote HTTP(S) URLs,
 * are passed through without being refetched.
 *
 * @param urls URLs to download.
 * @param impit Shared HTTP client used for the downloads.
 * @param options Options controlling file placement and naming.
 * @param context Logging and cancellation hooks provided by the caller.
 * @returns A parallel array of per-URL outcomes.
 */
export async function downloadImages(
  urls: string[],
  impit: Impit,
  options: DownloadImagesOptions,
  context: DownloadImagesContext
): Promise<DownloadedImage[]> {
  return Promise.all(urls.map(async (url, position) => downloadOne(url, position, impit, options, context)))
}

/**
 * Resolve a single slot of the batch, either passing through a local URL or delegating to
 * `downloadImage` for remote fetches.
 *
 * @param url URL for this slot.
 * @param position Zero-based index of this slot within the batch.
 * @param impit Shared HTTP client used for the download.
 * @param options Options controlling file placement and naming.
 * @param context Logging and cancellation hooks provided by the caller.
 * @returns The outcome for this slot.
 */
async function downloadOne(
  url: string,
  position: number,
  impit: Impit,
  options: DownloadImagesOptions,
  context: DownloadImagesContext
): Promise<DownloadedImage> {
  if (isLocalOrNonHttpUrl(url, options.workingDirectory)) {
    return { ok: true, localPath: url }
  }

  const localPath = await downloadImage(
    url,
    impit,
    {
      workingDirectory: options.workingDirectory,
      timestamp: options.timestamp,
      index: position + 1,
    },
    context
  )

  if (localPath === undefined) {
    return { ok: false, url }
  }

  return { ok: true, localPath }
}

/**
 * Report whether a URL is already local to the working directory or uses a non-HTTP scheme.
 *
 * @param url URL to inspect.
 * @param workingDirectory Directory treated as local to the plugin session.
 * @returns `true` when the URL should bypass the HTTP download path.
 */
function isLocalOrNonHttpUrl(url: string, workingDirectory: string): boolean {
  if (url.startsWith(workingDirectory)) {
    return true
  }

  return !url.startsWith("http://") && !url.startsWith("https://")
}
