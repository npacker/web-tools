import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"
import { join } from "path"
import { writeFile } from "fs/promises"
import UserAgent from "user-agents"
import { configSchematics } from "./config"

interface DuckDuckGoImageResult {
  image: string
}

interface SearchError {
  message: string
}

export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
  const tools: Tool[] = []

  const TIME_BETWEEN_REQUESTS_MS = 5000
  const IMAGE_FETCH_DELAY_MS = 2000

  let lastRequestTimestamp = 0

  const waitIfNeeded = () => {
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
    implementation: async ({ query, pageSize, safeSearch, page }, { status, warn, signal }) => {
      status("Initiating DuckDuckGo web search...")
      await waitIfNeeded()
      try {
        pageSize = undefinedIfAuto(ctl.getPluginConfig(configSchematics).get("pageSize"), 0) ?? pageSize ?? 5
        safeSearch =
          undefinedIfAuto(ctl.getPluginConfig(configSchematics).get("safeSearch"), "auto") ?? safeSearch ?? "moderate"

        const headers = spoofHeaders()
        const searchUrl = new URL("https://duckduckgo.com/html/")
        searchUrl.searchParams.append("q", query)
        if (safeSearch !== "moderate") searchUrl.searchParams.append("p", safeSearch === "strict" ? "-1" : "1")
        if (page > 1) searchUrl.searchParams.append("s", (pageSize * (page - 1) || 0).toString())

        console.log(`Fetching DuckDuckGo search results for query: ${searchUrl.toString()}`)
        const response = await fetch(searchUrl.toString(), {
          method: "GET",
          signal,
          headers,
        })

        if (!response.ok) {
          warn(`Failed to fetch search results: ${response.statusText}`)
          return `Error: Failed to fetch search results: ${response.statusText}`
        }

        const html = await response.text()
        const links: [string, string][] = []
        const regex = /\shref="[^"]*(https?[^?&"]+)[^>]*>([^<]*)/gm
        let match: RegExpExecArray | null
        while (links.length < pageSize && (match = regex.exec(html))) {
          const label = match[2].replace(/\s+/g, " ").trim()
          const resultUrl = decodeURIComponent(match[1])
          if (!links.some(([, existingUrl]) => existingUrl === resultUrl)) links.push([label, resultUrl])
        }

        if (links.length === 0) {
          return "No web pages found for the query."
        }

        status(`Found ${links.length} web pages.`)
        return {
          links,
          count: links.length,
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return "Search aborted by user."
        }

        const searchError = error as SearchError
        console.error(error)
        warn(`Error during search: ${searchError.message}`)
        return `Error: ${searchError.message}`
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
    implementation: async ({ query, pageSize, safeSearch, page }, { status, warn, signal }) => {
      status("Initiating DuckDuckGo image search...")
      await waitIfNeeded()
      try {
        pageSize = undefinedIfAuto(ctl.getPluginConfig(configSchematics).get("pageSize"), 0) ?? pageSize ?? 5
        safeSearch =
          undefinedIfAuto(ctl.getPluginConfig(configSchematics).get("safeSearch"), "auto") ?? safeSearch ?? "moderate"

        // Step 1: Fetch the vqd token
        const headers = spoofHeaders()
        const initialUrl = new URL("https://duckduckgo.com/")
        initialUrl.searchParams.append("q", query)
        initialUrl.searchParams.append("iax", "images")
        initialUrl.searchParams.append("ia", "images")

        const initialResponse = await fetch(initialUrl.toString(), {
          method: "GET",
          signal,
          headers,
        })

        if (!initialResponse.ok) {
          warn(`Failed to fetch initial response: ${initialResponse.statusText}`)
          return `Error: Failed to fetch initial response: ${initialResponse.statusText}`
        }

        const initialHtml = await initialResponse.text()
        const vqd = initialHtml.match(/vqd="([^"]+)"/)?.[1] as string

        if (!vqd) {
          warn("Failed to extract vqd token.")
          return "Error: Unable to extract vqd token."
        }

        // Step 2: sleep to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, IMAGE_FETCH_DELAY_MS))

        // Step 3: Fetch image results using the i.js endpoint
        const searchUrl = new URL("https://duckduckgo.com/i.js")
        searchUrl.searchParams.append("q", query)
        searchUrl.searchParams.append("o", "json")
        searchUrl.searchParams.append("l", "us-en") // Global region
        searchUrl.searchParams.append("vqd", vqd)
        searchUrl.searchParams.append("f", ",,,,,")
        if (safeSearch !== "moderate") searchUrl.searchParams.append("p", safeSearch === "strict" ? "-1" : "1")
        if (page > 1) searchUrl.searchParams.append("s", (pageSize * (page - 1) || 0).toString()) // Start at the appropriate index

        const searchResponse = await fetch(searchUrl.toString(), {
          method: "GET",
          signal,
          headers,
        })

        if (!searchResponse.ok) {
          warn(`Failed to fetch image results: ${searchResponse.statusText}`)
          return `Error: Failed to fetch image results: ${searchResponse.statusText}`
        }

        const data = await searchResponse.json()
        const imageResults = (data.results || []) as DuckDuckGoImageResult[]
        const imageURLs = imageResults
          .slice(0, pageSize)
          .map(result => result.image)
          .filter((url): url is string => url && url.match(/\.(jpg|png|gif|jpeg)$/i))

        if (imageURLs.length === 0) return "No images found for the query."

        status(`Found ${imageURLs.length} images. Fetching...`)

        const workingDirectory = ctl.getWorkingDirectory()
        const timestamp = Date.now()
        const downloadPromises = imageURLs.map(async (url: string, i: number) => {
          const index = i + 1
          try {
            const imageResponse = await fetch(url, {
              method: "GET",
              signal,
            })

            if (!imageResponse.ok) {
              warn(`Failed to fetch image ${index}: ${imageResponse.statusText}`)
              return null
            }

            const bytes = await imageResponse.bytes()

            if (bytes.length === 0) {
              warn(`Image ${index} is empty: ${url}`)
              return null
            }

            const fileExtension =
              /image\/([\w]+)/.exec(imageResponse.headers.get("content-type") || "")?.[1] ||
              /\.([\w]+)(?:\?.*)$/.exec(url)?.[1] ||
              "jpg"
            const fileName = `${timestamp}-${index}.${fileExtension}`
            const filePath = join(workingDirectory, fileName)
            const localPath = filePath.replace(/\\/g, "/").replace(/^.[A-Z]:/, "")
            await writeFile(filePath, bytes, "binary")
            return localPath
          } catch (error: unknown) {
            if (error instanceof DOMException && error.name === "AbortError") return null

            const searchError = error as SearchError
            warn(`Error fetching image ${index}: ${searchError.message}`)
            return null
          }
        })

        const downloadedImageURLs = (await Promise.all(downloadPromises)).filter(
          (path): path is string => path !== null
        )

        if (downloadedImageURLs.length === 0) {
          warn("Error fetching images")
          return imageURLs
        }

        status(`Downloaded ${downloadedImageURLs.length} images successfully.`)

        return downloadedImageURLs
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return "Search aborted by user."
        }

        const searchError = error as SearchError
        console.error(error)
        warn(`Error during search: ${searchError.message}`)
        return `Error: ${searchError.message}`
      }
    },
  })

  tools.push(duckDuckGoWebSearchTool)
  tools.push(duckDuckGoImageSearchTool)
  return tools
}

const undefinedIfAuto = (value: unknown, autoValue: unknown) => (value === autoValue ? undefined : (value as undefined))

function spoofHeaders() {
  return {
    "User-Agent": new UserAgent().toString(),
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    Referer: "https://duckduckgo.com/",
    Origin: "https://duckduckgo.com",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
  }
}
