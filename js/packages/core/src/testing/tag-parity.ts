// Tag parity: a host's SQL engine must find the same tags, and the same `tag:` results, as the memory runner. Test-only.
import { SEARCH_KINDS } from "../search/ast.js";
import { parseSearch } from "../search/parse.js";
import { type SearchPage, type SearchQuery, searchMemory } from "../search/run.js";
import type { TimeWindow } from "../stats/common.js";
import { activeTags, tagList } from "../tags/builtins.js";
import { expandTags } from "../tags/expand.js";
import { itemOwner, matchTags } from "../tags/match.js";
import type { TagRule } from "../tags/types.js";
import type { Trace } from "../types.js";
import { allPages, idOf } from "./search-parity.js";

const rule = (name: string, query: string): TagRule => ({ id: name, name, color: "blue", query, builtIn: false, enabled: true });

/** Rules that touch fields, attributes, free words, and negation, with the scenario's names. */
export const PARITY_TAGS = activeTags(tagList([
  rule("slow", "duration:>200ms"), rule("pay", "pay"), rule("db", "@db.system.name:*"), rule("failing", "status:5xx OR level:error"),
  rule("cart", "route:/api/cart -status:409"), rule("users", "user:user-1 OR user:user-2"), rule("hit", "@wizelens.tag.cache:hit"),
], new Set()));

/** Searches that use `tag:` in every form. */
export const TAG_PARITY_SEARCHES = ["tag:slow", "-tag:db", "tag:cache", "tag:cache:hit", "tag:beta", "tag:s*", "tag:*", "tag:nope", "tag:pay service:api", "tag:failing OR tag:users"];

/** Differences between `run` and the memory runner: tags on every row of each kind, and `tag:` searches. */
export async function tagParity(run: (q: SearchQuery) => Promise<SearchPage>, traces: readonly Trace[], window: TimeWindow, env?: string): Promise<string[]> {
  const out: string[] = [];
  const memory = async (q: SearchQuery) => searchMemory(traces, q);
  for (const kind of SEARCH_KINDS) {
    const rows = (await allPages(memory, { kind, node: null, window, limit: 200, env })).slice(0, 200);
    const items = rows.map((r) => ({ traceId: (r as { traceId: string }).traceId, owner: itemOwner(kind, r as never), timeMs: Number((r as { startMs?: number; timeMs?: number }).startMs ?? (r as { timeMs: number }).timeMs) }));
    const [got, want] = [await matchTags(run, kind, items, PARITY_TAGS, env), await matchTags(memory, kind, items, PARITY_TAGS, env)];
    if (JSON.stringify(got) !== JSON.stringify(want)) out.push(`${kind} tags: ${Object.keys(got).length} vs ${Object.keys(want).length} rows`);
    if (!Object.keys(want).length) out.push(`${kind} tags: the memory runner found none, so the case proves nothing`);
    for (const text of TAG_PARITY_SEARCHES) {
      const q = { kind, node: expandTags(parseSearch(text), PARITY_TAGS).node, window, limit: 50, env };
      const [a, b] = [(await allPages(run, q)).map(idOf), (await allPages(memory, q)).map(idOf)];
      if (a.join() !== b.join()) out.push(`${kind} "${text}": ${a.length} vs ${b.length} items`);
    }
  }
  return out;
}
