// The search language on the Requests, Traces, and Logs lists: hosts turn a structured search into the trace ids the lists keep.
import type { TimeWindow } from "../stats/common.js";
import type { SearchKind, SearchNode } from "./ast.js";
import { checkSearch } from "./check.js";
import { expandTags } from "../tags/expand.js";
import type { ActiveTag } from "../tags/types.js";
import type { Trace } from "../types.js";
import { decodeCursor, type SearchPage, type SearchQuery, searchMemory } from "./run.js";

/** Most trace ids one list search keeps. */
export const LIST_SEARCH_MAX = 1000;

const hasMore = (n: SearchNode): boolean => n.type !== "text" && (n.type !== "and" || n.items.some(hasMore));

/** True when `q` is a valid search with more than free words (fields, attributes, NOT, OR). Free words stay the old text filter. */
export function isStructuredSearch(q: string | undefined): boolean {
  if (!q?.trim()) return false;
  const p = checkSearch(q);
  return p.ok && p.node !== null && hasMore(p.node);
}

/** Pages a list searches: requests and traces by trace, logs by log line. */
export const LIST_SEARCH_KIND: Readonly<Record<string, SearchKind>> = { requests: "requests", traces: "traces", logs: "logs" };

/** Trace ids of everything matching `q` in the window, up to `max`, read page by page through a host's search. `tag:` uses the host's `tags`. */
export async function searchTraceIds(run: (q: SearchQuery) => Promise<SearchPage>, kind: SearchKind, q: string, window: TimeWindow, env?: string, tags: readonly ActiveTag[] = [], max = LIST_SEARCH_MAX): Promise<string[]> {
  const p = checkSearch(q);
  if (!p.ok) return [];
  const node = expandTags(p.node, tags).node;
  const ids = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: SearchPage = await run({ kind, node, window, limit: 200, cursor: decodeCursor(cursor), env });
    for (const item of page.items as { traceId: string }[]) ids.add(item.traceId);
    cursor = page.next;
  } while (cursor && ids.size < max);
  return [...ids].slice(0, max);
}

/** The same over traces in memory (in-app hosts, in the browser). */
export function memorySearchIds(traces: readonly Trace[], kind: SearchKind, q: string, window: TimeWindow, tags: readonly ActiveTag[] = [], max = LIST_SEARCH_MAX): string[] {
  const p = checkSearch(q);
  if (!p.ok) return [];
  const node = expandTags(p.node, tags).node;
  const ids = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: SearchPage = searchMemory(traces, { kind, node, window, limit: 200, cursor: decodeCursor(cursor) });
    for (const item of page.items as { traceId: string }[]) ids.add(item.traceId);
    cursor = page.next;
  } while (cursor && ids.size < max);
  return [...ids].slice(0, max);
}
