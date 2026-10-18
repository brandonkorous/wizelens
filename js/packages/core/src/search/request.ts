// The search API's inputs, read the same way by every host: `api/search?q=&kind=&range=&from=&to=&env=&limit=&cursor=`.
import { isTimeRange, TIME_RANGES, type TimeWindow } from "../stats/common.js";
import { SEARCH_KINDS, type SearchKind } from "./ast.js";
import { checkSearch } from "./check.js";
import { clampLimit, decodeCursor, type SearchQuery } from "./run.js";
import type { SuggestRequest } from "./suggest.js";

export type SearchRequest = { ok: true; query: SearchQuery } | { ok: false; error: string; start?: number; end?: number };

const isKind = (v: string): v is SearchKind => (SEARCH_KINDS as readonly string[]).includes(v);

/** The window: `from`/`to` in epoch ms, else `range` (default 24h) back from now. Null when it is invalid or too long. */
function windowOfParams(p: URLSearchParams, now: number, maxMs: number): TimeWindow | string {
  const [from, to] = [Number(p.get("from")), Number(p.get("to") ?? now)];
  if (p.has("from")) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return "from must be before to, both in epoch ms.";
    return to - from > maxMs ? "This window is longer than the data kept here." : { from, to };
  }
  const range = p.get("range") ?? "24h";
  if (!isTimeRange(range)) return `Unknown range "${range}". Use ${Object.keys(TIME_RANGES).join(", ")}.`;
  return TIME_RANGES[range].ms > maxMs ? "This range is longer than the data kept here." : { from: now - TIME_RANGES[range].ms, to: now };
}

/** A search query from URL parameters, or the error to send back (400). `maxMs` is how far back the host keeps data. */
export function searchRequestOf(p: URLSearchParams, now: number, maxMs: number): SearchRequest {
  const kind = p.get("kind") ?? "requests";
  if (!isKind(kind)) return { ok: false, error: `Unknown kind "${kind}". Use ${SEARCH_KINDS.join(", ")}.` };
  const window = windowOfParams(p, now, maxMs);
  if (typeof window === "string") return { ok: false, error: window };
  const parsed = checkSearch(p.get("q") ?? "");
  if (!parsed.ok) return parsed;
  const cursor = p.get("cursor");
  if (cursor && !decodeCursor(cursor)) return { ok: false, error: "This cursor is not valid. Start again without one." };
  const limit = clampLimit(p.has("limit") ? Number(p.get("limit")) || undefined : undefined);
  return { ok: true, query: { kind, node: parsed.node, window, limit, cursor: decodeCursor(cursor), env: p.get("env") || undefined } };
}

export type SuggestRequestResult = { ok: true; request: SuggestRequest } | { ok: false; error: string };

/** `api/search/suggest?field=&prefix=&range=&from=&to=&limit=`: no field asks for fields and attribute keys. */
export function suggestRequestOf(p: URLSearchParams, now: number, maxMs: number): SuggestRequestResult {
  const window = windowOfParams(p, now, maxMs);
  if (typeof window === "string") return { ok: false, error: window };
  const limit = Math.max(1, Math.min(50, Math.floor(Number(p.get("limit")) || 20)));
  return { ok: true, request: { field: p.get("field") || null, prefix: (p.get("prefix") ?? "").slice(0, 200), window, limit } };
}
