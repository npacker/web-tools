import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"
import { join } from "path"
import { writeFile } from "fs/promises"
import { JSDOM } from "jsdom"
import { Impit } from "impit"
import { configSchematics } from "./config"

class TTLCache<T> {
  private cache = new Map<string, { value: T; expiry: number }>()

  public constructor(
    private ttlMs: number,
    private maxSize: number
  ) {}

  public get(key: string): T | undefined {
    const entry = this.cache.get(key)

    if (!entry) return undefined

    if (Date.now() > entry.expiry) {
      this.cache.delete(key)

      return undefined
    }

    return entry.value
  }

  public set(key: string, value: T): void {
    if (this.cache.size >= this.maxSize) {
      this.evictExpired()
    }

    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value

      if (firstKey !== undefined) this.cache.delete(firstKey)
    }

    this.cache.set(key, { value, expiry: Date.now() + this.ttlMs })
  }

  private evictExpired(): void {
    const now = Date.now()

    for (const [key, entry] of this.cache) {
      if (now > entry.expiry) this.cache.delete(key)
    }
  }
}

interface DuckDuckGoImageResult {
  image: string
}

type SafeSearch = "strict" | "moderate" | "off"

const IMAGE_EXTENSIONS_RE = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i
const CONTENT_TYPE_EXT_RE = /image\/(jpeg|jpg|png|gif|webp)/

export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
  const TIME_BETWEEN_REQUESTS_MS = 5000
  const IMAGE_FETCH_DELAY_MS = 2000

  const searchCache = new TTLCache<{ links: [string, string][]; count: number }>(15 * 60_000, 100)
  const vqdCache = new TTLCache<string>(10 * 60_000, 50)

  const impit = new Impit({ browser: "chrome" })

  let lastRequestTimestamp = 0

  const waitIfNeeded = async () => {
    const timestamp = Date.now()
    const difference = timestamp - lastRequestTimestamp
    lastRequestTimestamp = timestamp

    if (difference < TIME_BETWEEN_REQUESTS_MS)
      return new Promise(resolve => setTimeout(resolve, TIME_BETWEEN_REQUESTS_MS - difference))

    return Promise.resolve()
  }

  const duckDuckGoWebSearchTool = tool({
    name: "Web Search",
    description: "Search for web pages on DuckDuckGo using a query string, returning a list of URLs.",
    parameters: {
      query: z.string().describe("The search query for finding web pages"),
      pageSize: z.number().int().min(1).max(10).optional().describe("Number of web results per page"),
      safeSearch: z.enum(["strict", "moderate", "off"]).optional().describe("Safe Search"),
      page: z.number().int().min(1).max(100).optional().default(1).describe("Page number for pagination"),
    },
    implementation: async ({ query, pageSize: paramPageSize, safeSearch: paramSafeSearch, page }, ctx) => {
      ctx.status("Initiating DuckDuckGo web search...")
      await waitIfNeeded()

      try {
        const { pageSize, safeSearch } = resolveConfig(ctl, paramPageSize, paramSafeSearch)
        const cacheKey = `web:${query}:${safeSearch}:${page}`
        const cached = searchCache.get(cacheKey)

        if (cached) {
          ctx.status(`Found ${cached.count} web pages (cached).`)

          return cached
        }

        const searchUrl = new URL("https://duckduckgo.com/html/")

        searchUrl.searchParams.append("q", query)

        if (safeSearch !== "moderate") searchUrl.searchParams.append("p", safeSearch === "strict" ? "1" : "-1")

        if (page > 1) searchUrl.searchParams.append("s", (pageSize * (page - 1)).toString())

        const response = await impit.fetch(searchUrl.toString(), {
          method: "GET",
          signal: ctx.signal,
        })

        if (!response.ok) {
          ctx.warn(`Failed to fetch search results: ${response.statusText}`)
          return `Error: Failed to fetch search results: ${response.statusText}`
        }

        const html = await response.text()
        const links = parseSearchResults(html, pageSize)

        if (links.length === 0) {
          return "No web pages found for the query."
        }

        ctx.status(`Found ${links.length} web pages.`)

        const result = { links, count: links.length }

        searchCache.set(cacheKey, result)

        return result
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return "Search aborted by user."
        }

        const message = getErrorMessage(error)
        ctx.warn(`Error during search: ${message}`)
        return `Error: ${message}`
      }
    },
  })

  const duckDuckGoImageSearchTool = tool({
    name: "Image Search",
    description: "Search for images on DuckDuckGo using a query string and return a list of image URLs.",
    parameters: {
      query: z.string().describe("The search query for finding images"),
      pageSize: z.number().int().min(1).max(10).optional().default(10).describe("Number of image results per page"),
      safeSearch: z.enum(["strict", "moderate", "off"]).optional().default("moderate").describe("Safe Search"),
      page: z.number().int().min(1).max(100).optional().default(1).describe("Page number for pagination"),
    },
    implementation: async ({ query, pageSize: paramPageSize, safeSearch: paramSafeSearch, page }, ctx) => {
      ctx.status("Initiating DuckDuckGo image search...")
      await waitIfNeeded()

      try {
        const { pageSize, safeSearch } = resolveConfig(ctl, paramPageSize, paramSafeSearch)
        const vqdCacheKey = `vqd:${query}`
        let vqd = vqdCache.get(vqdCacheKey)

        if (vqd === undefined) {
          vqd = await fetchVqdToken(query, impit, ctx.signal)

          if (vqd === undefined) {
            ctx.warn("Failed to extract vqd token.")

            return "Error: Unable to extract vqd token."
          }

          vqdCache.set(vqdCacheKey, vqd)
          await new Promise(resolve => setTimeout(resolve, IMAGE_FETCH_DELAY_MS))
        }

        const searchUrl = new URL("https://duckduckgo.com/i.js")
        searchUrl.searchParams.append("q", query)
        searchUrl.searchParams.append("o", "json")
        searchUrl.searchParams.append("l", "us-en")
        searchUrl.searchParams.append("vqd", vqd)
        searchUrl.searchParams.append("f", ",,,,,")

        if (safeSearch !== "moderate") searchUrl.searchParams.append("p", safeSearch === "strict" ? "1" : "-1")

        if (page > 1) searchUrl.searchParams.append("s", (pageSize * (page - 1)).toString())

        const searchResponse = await impit.fetch(searchUrl.toString(), {
          method: "GET",
          signal: ctx.signal,
        })

        if (!searchResponse.ok) {
          ctx.warn(`Failed to fetch image results: ${searchResponse.statusText}`)
          return `Error: Failed to fetch image results: ${searchResponse.statusText}`
        }

        const data = (await searchResponse.json()) as { results?: DuckDuckGoImageResult[] }
        const imageURLs = extractImageURLs(data.results ?? [], pageSize)

        if (imageURLs.length === 0) return "No images found for the query."

        ctx.status(`Found ${imageURLs.length} images. Fetching...`)

        const workingDirectory = ctl.getWorkingDirectory()
        const timestamp = Date.now()
        const downloadPromises = imageURLs.map(async (url, i) =>
          downloadImage(url, i + 1, impit, ctx.signal, workingDirectory, timestamp, ctx.warn)
        )
        const downloadedPaths = (await Promise.all(downloadPromises)).filter((path): path is string => path !== null)

        if (downloadedPaths.length === 0) {
          ctx.warn("Error fetching images")
          return imageURLs
        }

        ctx.status(`Downloaded ${downloadedPaths.length} images successfully.`)

        return downloadedPaths
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return "Search aborted by user."
        }

        const message = getErrorMessage(error)
        ctx.warn(`Error during search: ${message}`)
        return `Error: ${message}`
      }
    },
  })

  return [duckDuckGoWebSearchTool, duckDuckGoImageSearchTool]
}

function resolveConfig(
  ctl: ToolsProviderController,
  paramPageSize: number | undefined,
  paramSafeSearch: SafeSearch | undefined
) {
  const config = ctl.getPluginConfig(configSchematics)
  const rawPageSize = config.get("pageSize")
  const rawSafeSearch = config.get("safeSearch")

  return {
    pageSize: (rawPageSize !== 0 ? (rawPageSize as number) : undefined) ?? paramPageSize ?? 5,
    safeSearch: (rawSafeSearch !== "auto" ? (rawSafeSearch as SafeSearch) : undefined) ?? paramSafeSearch ?? "moderate",
  }
}

function parseSearchResults(html: string, pageSize: number): [string, string][] {
  const links: [string, string][] = []
  const dom = new JSDOM(html)
  const linkElements = dom.window.document.querySelectorAll(".result__a")

  for (const link of linkElements) {
    if (links.length >= pageSize) break

    const href = link.getAttribute("href")
    const label = link.textContent.replace(/\s+/g, " ").trim()

    if (href !== null && label !== "" && !links.some(([, existingUrl]) => existingUrl === href)) {
      links.push([label, href])
    }
  }

  return links
}

async function fetchVqdToken(query: string, impit: Impit, signal: AbortSignal): Promise<string | undefined> {
  const url = new URL("https://duckduckgo.com/")

  url.searchParams.append("q", query)
  url.searchParams.append("iax", "images")
  url.searchParams.append("ia", "images")

  const response = await impit.fetch(url.toString(), {
    method: "GET",
    signal,
  })

  if (!response.ok) return undefined

  const html = await response.text()
  const dom = new JSDOM(html)
  const vqd = dom.window.document.querySelector('input[name="vqd"]')?.getAttribute("value") ?? undefined

  if (vqd === undefined || vqd === "") return undefined

  return vqd
}

function extractImageURLs(results: DuckDuckGoImageResult[], pageSize: number): string[] {
  return results
    .slice(0, pageSize)
    .map(result => result.image)
    .filter(url => IMAGE_EXTENSIONS_RE.test(url))
    .filter((url, i, arr) => arr.indexOf(url) === i)
}

async function downloadImage(
  url: string,
  index: number,
  impit: Impit,
  signal: AbortSignal,
  workingDirectory: string,
  timestamp: number,
  warn: (message: string) => void
): Promise<string | null> {
  try {
    const timeoutSignal = AbortSignal.timeout(10_000)
    const combinedSignal = AbortSignal.any([signal, timeoutSignal])
    const response = await impit.fetch(url, {
      method: "GET",
      signal: combinedSignal,
    })

    if (!response.ok) {
      warn(`Failed to fetch image ${index}: ${response.statusText}`)
      return null
    }

    const bytes = await response.bytes()

    if (bytes.length === 0) {
      warn(`Image ${index} is empty: ${url}`)
      return null
    }

    const contentTypeExt = CONTENT_TYPE_EXT_RE.exec(response.headers.get("content-type") ?? "")?.[1]?.replace(
      "jpeg",
      "jpg"
    )
    const urlExt = IMAGE_EXTENSIONS_RE.exec(url)?.[1]
    const fileExtension = contentTypeExt ?? urlExt ?? "jpg"
    const fileName = `${timestamp}-${index}.${fileExtension}`
    const filePath = join(workingDirectory, fileName)
    const localPath = filePath.replace(/\\/g, "/").replace(/^(?:\/)?[A-Z]:/, "")
    await writeFile(filePath, bytes)

    return localPath
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") return null

    warn(`Error fetching image ${index}: ${getErrorMessage(error)}`)
    return null
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
