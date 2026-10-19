// Saved searches: a named set of page filters, kept by the hub and the cloud (per project). Log searches become charts and alerts.

/** What a saved search filters. Only log searches for now. */
export type SavedSearchKind = "logs";

export interface SavedSearch {
  id: string;
  kind: SavedSearchKind;
  name: string;
  /** The page's URL filters, for example `{ level: "error", q: "timeout" }`. */
  params: Record<string, string>;
  createdMs: number;
  /** Who saved it (cloud), or null. */
  createdBy: string | null;
}

/** The Logs page filters a log search keeps. */
export const LOG_SEARCH_PARAMS = ["level", "exact", "service", "category", "q", "pattern", "origin"] as const;

export const SAVED_SEARCH_NAME_MAX = 100;
const VALUE_MAX = 500;

/** Keep only the known filters, as short strings; empty values are left out. */
export function cleanSearchParams(params: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!params || typeof params !== "object") return out;
  const p = params as Record<string, unknown>;
  for (const k of LOG_SEARCH_PARAMS) if (typeof p[k] === "string" && p[k]) out[k] = (p[k] as string).slice(0, VALUE_MAX);
  return out;
}

/** A new saved search from a request body, or an error message. */
export function parseSavedSearch(body: unknown): { kind: SavedSearchKind; name: string; params: Record<string, string> } | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > SAVED_SEARCH_NAME_MAX) return `Give the search a name of 1 to ${SAVED_SEARCH_NAME_MAX} characters.`;
  if ((b.kind ?? "logs") !== "logs") return "Only log searches can be saved.";
  return { kind: "logs", name, params: cleanSearchParams(b.params) };
}
