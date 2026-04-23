/**
 * Defense-in-depth guard rejecting tool invocations whose argument object
 * carries keys that are not part of the declared parameter schema.
 *
 * The LM Studio SDK exposes `parameters` as `Record<string, ZodType>` rather
 * than a `ZodObject`, so `.strict()` cannot be attached at the object level.
 * The SDK's JSON-schema generator already filters unknown keys in practice;
 * this helper protects against SDK behaviour drift.
 */

/**
 * Returns the received arguments unchanged when every key appears in the
 * allowed list, or a user-facing error string enumerating the offending keys.
 *
 * The helper is pure and has no side effects. Returning a string matches the
 * existing SDK convention whereby a tool implementation surfaces errors by
 * resolving to a human-readable message.
 *
 * @param received Argument object handed to a tool's `implementation`.
 * @param allowed Parameter names declared by the tool's schema.
 * @returns The unchanged `received` object when all keys are allowed; otherwise a formatted error string.
 */
export function rejectUnknownParameters<T extends object>(
  received: T,
  allowed: readonly (keyof T & string)[]
): T | string {
  const allowedSet = new Set<string>(allowed)
  const unknown: string[] = []

  for (const key of Object.keys(received)) {
    if (!allowedSet.has(key)) {
      unknown.push(key)
    }
  }

  if (unknown.length === 0) {
    return received
  }

  return `Error: unknown parameter(s): ${unknown.join(", ")}`
}
