// Which tag rules match a page of rows: each rule runs as a search on just those traces, on the host's own engine.
import { SEARCH_KINDS, type SearchKind } from "../search/ast.js";
import { logOwner, type SearchItem } from "../search/items.js";
import { decodeCursor, type SearchPage, type SearchQuery } from "../search/run.js";
import type { LogRow } from "../stats/logs.js";
import { TAG_LIMITS, type ActiveTag } from "./types.js";

/** One row to check: its trace, its part (span id, log index, or "" for a request or trace), and when it happened. */
export interface TagMatchItem {
  traceId: string;
  owner: string;
  timeMs: number;
}

/** Tag names per row, keyed by `matchKey`; rows without a tag are left out. */
export type TagMatches = Record<string, string[]>;

export const matchKey = (traceId: string, owner: string): string => `${traceId} ${owner}`;

/** A row's part, as search results carry it. */
export function itemOwner(kind: SearchKind, item: SearchItem): string {
  if (kind === "spans") return (item as { spanId: string }).spanId;
  if (kind === "logs") return logOwner(item as LogRow);
  return "";
}

/** Runs one search page; every host passes its own runner (memory, SQLite, Postgres, ClickHouse). */
export type SearchRunner = (q: SearchQuery) => Promise<SearchPage> | SearchPage;

/** Pages one rule may read; spans and logs can be many per trace. */
const MAX_PAGES = 10;

/** Room around the rows' times: the trace ids pick the rows, and a trace's request can start well after the trace. */
export const MATCH_SLACK_MS = 3_600_000;

async function rowsOfTag(run: SearchRunner, base: Omit<SearchQuery, "node">, tag: ActiveTag, want: ReadonlySet<string>): Promise<string[]> {
  const found: string[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page: SearchPage = await run({ ...base, node: tag.node, cursor: decodeCursor(cursor) });
    for (const item of page.items) {
      const key = matchKey((item as { traceId: string }).traceId, itemOwner(base.kind, item));
      if (want.has(key)) found.push(key);
    }
    cursor = page.next;
    if (!cursor) break;
  }
  return found;
}

/** The tags on each row. Rules run at once; names keep the rules' order. */
export async function matchTags(run: SearchRunner, kind: SearchKind, items: readonly TagMatchItem[], tags: readonly ActiveTag[], env?: string): Promise<TagMatches> {
  if (!items.length || !tags.length) return {};
  const times = items.map((i) => i.timeMs);
  const window = { from: Math.min(...times) - MATCH_SLACK_MS, to: Math.max(...times) + MATCH_SLACK_MS };
  const base = { kind, window, limit: 200, env, traceIds: [...new Set(items.map((i) => i.traceId))] };
  const want = new Set(items.map((i) => matchKey(i.traceId, i.owner)));
  const hits = await Promise.all(tags.map((t) => rowsOfTag(run, base, t, want)));
  const out: TagMatches = {};
  tags.forEach((t, i) => hits[i]!.forEach((key) => (out[key] ??= []).push(t.name)));
  return out;
}

export type TagMatchRequest = { ok: true; kind: SearchKind; items: TagMatchItem[] } | { ok: false; error: string };

const isKind = (v: unknown): v is SearchKind => typeof v === "string" && (SEARCH_KINDS as readonly string[]).includes(v);

function itemOf(raw: unknown): TagMatchItem | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const owner = r.owner ?? "";
  if (typeof r.traceId !== "string" || !/^[0-9a-f]{1,64}$/i.test(r.traceId) || typeof owner !== "string" || owner.length > 64) return null;
  return typeof r.timeMs === "number" && Number.isFinite(r.timeMs) ? { traceId: r.traceId.toLowerCase(), owner, timeMs: r.timeMs } : null;
}

/** The body of `POST api/tags/match`: `{ kind, items: [{ traceId, owner, timeMs }] }`, the same on every host. */
export function tagMatchRequestOf(body: unknown): TagMatchRequest {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (!isKind(b.kind)) return { ok: false, error: `Set kind to one of ${SEARCH_KINDS.join(", ")}.` };
  if (!Array.isArray(b.items) || b.items.length > TAG_LIMITS.matchItems) return { ok: false, error: `Send items: up to ${TAG_LIMITS.matchItems} rows.` };
  const items = b.items.map(itemOf);
  if (items.some((i) => !i)) return { ok: false, error: "Each item needs traceId (hex), owner (text, may be empty), and timeMs (epoch ms)." };
  return { ok: true, kind: b.kind, items: items as TagMatchItem[] };
}
