/**
 * Discovery of the LM Studio home directory.
 *
 * LM Studio stores its data under one of two roots depending on the install flavour, and users
 * can override the location via a `.lmstudio-home-pointer` file in their home directory. This
 * module encapsulates that lookup so plugin code never hard-codes `~/.lmstudio`.
 */

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

/**
 * Name of the pointer file written into the user's home directory that records the resolved
 * LM Studio home path for subsequent lookups.
 */
const POINTER_FILE_NAME = ".lmstudio-home-pointer"
/**
 * Memoised result of `findLMStudioHome`, so repeated calls avoid re-reading the pointer file.
 */
let lmstudioHome: string | undefined

/**
 * Locate the LM Studio home directory for the current user.
 *
 * Resolution order:
 * 1. An in-process cached value from a previous call.
 * 2. The path recorded in `~/.lmstudio-home-pointer`, if that file exists and is non-empty.
 * 3. `~/.cache/lm-studio` when it already exists on disk (Linux/Snap-style install).
 * 4. `~/.lmstudio` as the default (desktop install).
 *
 * In cases (3) and (4) the resolved path is also written to the pointer file so future
 * invocations short-circuit via case (2).
 *
 * The user's home directory is resolved through `realpathSync` so symlinked home directories
 * (common on macOS and some Windows profile setups) produce a canonical path.
 *
 * @returns The absolute path to the LM Studio home directory.
 */
export function findLMStudioHome(): string {
  if (lmstudioHome !== undefined) {
    return lmstudioHome
  }

  const resolvedHomeDirectory = realpathSync(homedir())
  const pointerFilePath = path.join(resolvedHomeDirectory, POINTER_FILE_NAME)

  if (existsSync(pointerFilePath)) {
    const pointerValue = readFileSync(pointerFilePath, "utf8").trim()

    if (pointerValue.length > 0) {
      lmstudioHome = pointerValue

      return lmstudioHome
    }
  }

  const cacheHome = path.join(resolvedHomeDirectory, ".cache", "lm-studio")

  if (existsSync(cacheHome)) {
    lmstudioHome = cacheHome
    writeFileSync(pointerFilePath, lmstudioHome, "utf8")

    return lmstudioHome
  }

  lmstudioHome = path.join(resolvedHomeDirectory, ".lmstudio")
  writeFileSync(pointerFilePath, lmstudioHome, "utf8")

  return lmstudioHome
}
