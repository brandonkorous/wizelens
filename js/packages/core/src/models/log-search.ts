// Log searches: the Logs page filters a saved search keeps in its address, and that a log alert counts.

/** The Logs page filters a log search keeps. */
export const LOG_SEARCH_PARAMS = ["level", "exact", "service", "category", "q", "pattern", "origin"] as const;

const VALUE_MAX = 500;

/** Keep only the known filters, as short strings; empty values are left out. */
export function cleanSearchParams(params: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!params || typeof params !== "object") return out;
  const p = params as Record<string, unknown>;
  for (const k of LOG_SEARCH_PARAMS) if (typeof p[k] === "string" && p[k]) out[k] = (p[k] as string).slice(0, VALUE_MAX);
  return out;
}

/** The Logs page address for these filters: "#/logs?level=error&q=timeout", or "#/logs" for every line. */
export function logSearchHref(params: Record<string, string>): string {
  const q = new URLSearchParams(cleanSearchParams(params)).toString();
  return q ? `#/logs?${q}` : "#/logs";
}

/** The log filters of a Logs page address, or null when the address is another page. */
export function logSearchOf(href: string): Record<string, string> | null {
  const m = /^#\/logs(?:\?(.*))?$/.exec(href);
  return m ? cleanSearchParams(Object.fromEntries(new URLSearchParams(m[1] ?? ""))) : null;
}
