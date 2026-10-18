// Running a search: the request, the page it returns, its cursor, and the memory runner (in-app and tests).
import type { TimeWindow } from "../stats/common.js";
import type { Trace } from "../types.js";
import type { SearchKind, SearchNode } from "./ast.js";
import { type DocEntry, docEntries, type SearchItems } from "./items.js";
import { compileSearch } from "./match.js";

/** Where the last page stopped: newest first, then trace id, then owner (span id or log index). */
export interface SearchCursor {
  timeMs: number;
  traceId: string;
  owner: string;
}

export interface SearchQuery<K extends SearchKind = SearchKind> {
  kind: K;
  node: SearchNode | null;
  window: TimeWindow;
  limit: number;
  cursor?: SearchCursor | null;
  env?: string;
}

export interface SearchPage<K extends SearchKind = SearchKind> {
  kind: K;
  items: SearchItems[K][];
  /** Pass it back as `cursor` for the next page; null on the last page. */
  next: string | null;
}

/** Most results one page may ask for. */
export const SEARCH_PAGE_MAX = 200;

export const encodeCursor = (c: SearchCursor): string => btoa(JSON.stringify([c.timeMs, c.traceId, c.owner]));

/** A cursor from its text, or null when it is missing or broken. */
export function decodeCursor(s: string | null | undefined): SearchCursor | null {
  if (!s) return null;
  try {
    const [timeMs, traceId, owner] = JSON.parse(atob(s)) as unknown[];
    if (typeof timeMs !== "number" || typeof traceId !== "string" || typeof owner !== "string") return null;
    return { timeMs, traceId, owner };
  } catch {
    return null;
  }
}

/** Result order: newest first, then trace id and owner in code-unit order (SQL `COLLATE "C"`). */
export function compareEntries(a: { timeMs: number; traceId: string; owner: string }, b: { timeMs: number; traceId: string; owner: string }): number {
  if (a.timeMs !== b.timeMs) return b.timeMs - a.timeMs;
  if (a.traceId !== b.traceId) return a.traceId < b.traceId ? -1 : 1;
  return a.owner === b.owner ? 0 : a.owner < b.owner ? -1 : 1;
}

/** One page of results and the cursor after it, from rows already sorted and past the cursor. */
export function pageOf<T>(rows: readonly T[], limit: number, keyOf: (row: T) => SearchCursor): { rows: T[]; next: string | null } {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { rows: page, next: rows.length > limit && last ? encodeCursor(keyOf(last)) : null };
}

export const clampLimit = (n: number | undefined): number => Math.max(1, Math.min(SEARCH_PAGE_MAX, Math.floor(n ?? 50)));

/** Search traces held in memory. */
export function searchMemory<K extends SearchKind>(traces: readonly Trace[], q: SearchQuery<K>): SearchPage<K> {
  const match = compileSearch(q.node);
  const limit = clampLimit(q.limit);
  const keyOf = (e: DocEntry<K>) => ({ timeMs: e.timeMs, traceId: String(e.doc.fields.trace), owner: e.owner });
  const hits: DocEntry<K>[] = [];
  for (const t of traces) {
    for (const e of docEntries(t, q.kind, q.env)) {
      if (e.timeMs < q.window.from || e.timeMs >= q.window.to) continue;
      if (q.cursor && compareEntries(keyOf(e), q.cursor) <= 0) continue;
      if (match(e.doc)) hits.push(e);
    }
  }
  hits.sort((a, b) => compareEntries(keyOf(a), keyOf(b)));
  const { rows, next } = pageOf(hits, limit, keyOf);
  return { kind: q.kind, items: rows.map((e) => e.item()), next };
}
