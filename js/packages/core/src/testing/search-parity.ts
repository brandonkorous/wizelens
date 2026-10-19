// Search parity: a host's SQL search must page through the same results as the memory runner. Test-only.
import { SEARCH_KINDS, type SearchKind } from "../search/ast.js";
import { parseSearch } from "../search/parse.js";
import { decodeCursor, type SearchPage, type SearchQuery, searchMemory } from "../search/run.js";
import { type Suggestion, type SuggestRequest, suggestMemory } from "../search/suggest.js";
import type { TimeWindow } from "../stats/common.js";
import type { Trace } from "../types.js";

/** Searches that touch every field, value type, and operator, with the scenario's names. */
export const SEARCH_PARITY_QUERIES = [
  "", "service:api", "service:API", "service:gateway service:orders", "-service:browser", "service:work*", "env:prod", "env:*", "-env:*",
  "status:500", "status:5xx", "status:2xx -status:200", "status:>=400", "status:400..499", "status:error", "status:ok", "-status:unset",
  "duration:>500ms", "duration:<=20", "duration:10ms..200ms", "error:true", "error:false", "method:POST", "method:get", "path:/api/*",
  "path:*pay*", "path:/checkout", "route:/orders/*", "user:*", "user:u-1*", "name:*select*", "kind:client", "category:db", "level:>=warn",
  "level:error", "level:<info", "message:*timeout*", "trace:a", "span:*", "pay", '"/api/cart"', "select", "SELECT", "orders OR billing",
  "(service:api OR service:billing) error:true", "NOT (status:5xx OR level:error)", "-select -pay", "@db.system.name:*", "@db.system.name:postgres*",
  "@http.response.status_code:>=500", "@http.response.status_code:500", "@enduser.id:*", "-@enduser.id:*", "@client.address:10.*",
  "@http.route:*{id}*", "@exception.type:*Error", "@missing.key:*", "@url.path:/api/pay", "*", "pa", "ers", '"/api/c"', "-ord",
];

/** Which document an item is: a log key, a trace and span id, or a trace id. */
function idOf(item: unknown): string {
  const r = item as { key?: string; traceId: string; spanId?: string };
  return r.key ?? (r.spanId ? `${r.traceId}:${r.spanId}` : r.traceId);
}

const pageSize = (kind: SearchKind, i: number): number => [7, 50, 200][(i + kind.length) % 3]!;

/** Every page of one search, following the cursor. */
async function allPages(run: (q: SearchQuery) => Promise<SearchPage>, q: Omit<SearchQuery, "cursor">): Promise<unknown[]> {
  const items: unknown[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < 1000; pages++) {
    const page: SearchPage = await run({ ...q, cursor: decodeCursor(cursor) });
    items.push(...page.items);
    if (!(cursor = page.next)) return items;
  }
  throw new Error("Too many pages");
}

/** Differences between `run` and the memory runner over `traces`, per query, kind, and window. */
export async function searchParity(run: (q: SearchQuery) => Promise<SearchPage>, traces: readonly Trace[], windows: readonly TimeWindow[], env?: string): Promise<string[]> {
  const out: string[] = [];
  for (const [i, text] of SEARCH_PARITY_QUERIES.entries()) {
    const node = parseSearch(text);
    for (const kind of SEARCH_KINDS) {
      for (const window of windows) {
        const q = { kind, node, window, limit: pageSize(kind, i), env };
        const [got, want] = [(await allPages(run, q)).map(idOf), (await allPages(async (x) => searchMemory(traces, x), q)).map(idOf)];
        if (got.join() !== want.join()) out.push(`${kind} "${text}" [${window.from}, ${window.to}): ${got.length} vs ${want.length} items`);
      }
    }
  }
  return out;
}

/** How many results the memory runner finds per query, to show the queries are not all empty. */
export function searchHits(traces: readonly Trace[], window: TimeWindow): number {
  return SEARCH_PARITY_QUERIES.filter((text) => SEARCH_KINDS.some((kind) => searchMemory(traces, { kind, node: parseSearch(text), window, limit: 1 }).items.length)).length;
}

/** Autocomplete asks that touch keys, attribute values, field values, and fixed values. */
export const SUGGEST_PARITY: [string | null, string][] = [
  [null, ""], [null, "ser"], [null, "@db"], [null, "@HTTP"], ["@db.system.name", ""], ["@http.response.status_code", "5"], ["@enduser.id", "U"],
  ["service", ""], ["service", "or"], ["method", ""], ["path", "/api"], ["route", ""], ["category", "d"], ["user", ""], ["name", "sel"],
  ["status", ""], ["level", "w"], ["kind", ""], ["error", ""], ["message", ""], ["@missing", ""],
];

/** Differences between a host's suggestions and the memory ones. */
export async function suggestParity(run: (r: SuggestRequest) => Promise<Suggestion[]>, traces: readonly Trace[], window: TimeWindow): Promise<string[]> {
  const out: string[] = [];
  for (const [field, prefix] of SUGGEST_PARITY) {
    for (const limit of [3, 20]) {
      const r = { field, prefix, window, limit };
      const [got, want] = [await run(r), suggestMemory(traces, r)];
      if (JSON.stringify(got) !== JSON.stringify(want)) out.push(`${field ?? "keys"} "${prefix}" ${limit}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
    }
  }
  return out;
}
