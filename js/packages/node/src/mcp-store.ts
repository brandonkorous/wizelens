import { activeTags, checkSearch, decodeCursor, expandTags, type SearchItems, type SearchKind, type SearchNode, type SearchQuery, searchMemory, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import { z } from "zod";
import { type McpDataSource, tagsOf } from "./mcp-shared.js";

// Tools that read the whole store through search, not a slice of recent traces (docs/SEARCH-PLAN.md, "MCP").
export const RANGES = Object.keys(TIME_RANGES) as [TimeRange, ...TimeRange[]];

export const rangeArg = (what: string) => z.enum(RANGES).optional().describe(`How far back ${what}: 15m, 1h, 6h, 24h (default), 7d, 30d.`);

const PAGE = 200;

export const windowOf = (data: McpDataSource, range: TimeRange) => {
  const now = data.now?.() ?? Date.now();
  return { from: now - TIME_RANGES[range].ms, to: now };
};

const idOf = (item: unknown): string => {
  const r = item as { key?: string; traceId: string; spanId?: string };
  return r.key ?? (r.spanId ? `${r.traceId}:${r.spanId}` : r.traceId);
};

const timeOf = (item: unknown): number => {
  const r = item as { startMs?: number; timeMs?: number };
  return r.startMs ?? r.timeMs ?? 0;
};

/** Store pages, newest first, up to `max`. */
async function storePages(data: McpDataSource, base: Omit<SearchQuery, "limit" | "cursor">, max: number): Promise<unknown[]> {
  const out: unknown[] = [];
  let cursor: string | null = null;
  do {
    const page = await data.search!({ ...base, limit: Math.min(PAGE, max - out.length), cursor: decodeCursor(cursor) });
    out.push(...page.items);
    cursor = page.next;
  } while (cursor && out.length < max);
  return out;
}

/** The matches of a search, newest first, up to `max`: the store, plus the newest traces in memory, which the store indexes only once they go quiet. `tag:` reads the host's tags. */
export async function findAll<K extends SearchKind>(data: McpDataSource, kind: K, node: SearchNode | null, range: TimeRange, max: number): Promise<SearchItems[K][]> {
  const base = { kind, node: expandTags(node, activeTags(await tagsOf(data))).node, window: windowOf(data, range), env: data.env };
  const recent = searchMemory(await data.all(), { ...base, limit: max }).items as unknown[];
  if (!data.search) return recent as SearchItems[K][];
  const seen = new Map<string, unknown>();
  for (const item of [...(await storePages(data, base, max)), ...recent]) seen.set(idOf(item), item);
  return [...seen.values()].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, max) as SearchItems[K][];
}

/** Every part must hold: tool filters as search text, and the caller's own search. Null parts are left out. */
export function allOf(parts: readonly (string | null | undefined)[]): { ok: true; node: SearchNode | null } | { ok: false; error: string } {
  const items: SearchNode[] = [];
  for (const part of parts) {
    if (!part) continue;
    const r = checkSearch(part);
    if (!r.ok) return { ok: false, error: `${r.error} (in "${part}")` };
    if (r.node) items.push(r.node);
  }
  return { ok: true, node: items.length === 0 ? null : items.length === 1 ? items[0]! : { type: "and", items } };
}
