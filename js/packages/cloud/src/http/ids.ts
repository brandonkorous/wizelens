import { MAX_BULK } from "@wizeworks/lens-core/internal";
import { fail } from "./http.js";

/** A checked list of ids from a body field: text, no repeats, 1 to MAX_BULK. */
export function idsOf(raw: unknown, what: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.some((id) => typeof id !== "string" || !id)) return fail(400, `Send the ${what} as a list of ids.`);
  if (raw.length > MAX_BULK) fail(400, `Send up to ${MAX_BULK} ${what} in one request.`);
  return [...new Set(raw as string[])];
}
