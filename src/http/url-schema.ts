/**
 * Zod URL schema restricted to fetchable http(s) origins.
 */

import { z } from "zod"

/**
 * Zod schema that accepts a URL string whose protocol is `http` or `https`.
 * Rejects `file://`, `javascript:`, `data:`, and other non-fetchable schemes at
 * the tool boundary instead of deferring the rejection to the fetch layer.
 *
 * @const {z.ZodEffects<z.ZodString, string, string>}
 */
export const httpUrlSchema = z
  .string()
  .url()
  .refine(value => /^https?:\/\//i.test(value), { message: "URL must use http or https." })
