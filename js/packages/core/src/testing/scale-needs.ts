// A broad set of needs for SQL-versus-memory parity tests on the scenario. Test-only: excluded from the build.
import type { GroupNeed, ListNeed, Need, NeedResults, PageContext, SeriesNeed, SyncExecutor, TraceNeed } from "../scale/needs.js";
import { type AggOrder, type BucketCount } from "../scale/needs.js";
import { ROLLUP_KINDS, type RollupKind } from "../scale/kinds.js";
import type { ListFilter } from "../scale/needs.js";

const ORDERS: AggOrder[] = ["n", "sum", "avg", "lastMs", "c0", "c1", "c2", "c3", "c4", "c5"];
const BUCKETS: BucketCount[] = [16, 24, 48];
const SERIES_KINDS: RollupKind[] = ["req", "trace", "db", "err", "log", "pv", "pv.g", "rc", "svc", "req.dim", "err.s", "log.s", "req.part"];

/** Every kind as groups in both windows, with and without extras, plus orders, prefixes, keys, and parts. */
function groupNeeds(keysOf: (kind: RollupKind) => string[]): GroupNeed[] {
  const out: GroupNeed[] = [];
  for (const kind of ROLLUP_KINDS) {
    out.push({ type: "groups", id: `g:${kind}:cur`, kind, window: "cur" }, { type: "groups", id: `g:${kind}:prev`, kind, window: "prev", hist: true, top: true });
    out.push({ type: "groups", id: `g:${kind}:full`, kind, window: "cur", hist: true, top: true, ids: true });
    const keys = keysOf(kind);
    if (keys.length) out.push({ type: "groups", id: `g:${kind}:keys`, kind, window: "cur", top: true, filter: { keys: [...keys.slice(0, 2), "nope"] } });
  }
  for (const by of ORDERS) {
    for (const kind of ["svc", "db.q", "rc", "err.g"] as RollupKind[]) {
      out.push({ type: "groups", id: `o:${kind}:${by}`, kind, window: "cur", hist: true, top: true, ids: true, order: { by, desc: true, limit: 3 } });
      out.push({ type: "groups", id: `o:${kind}:${by}:asc`, kind, window: "cur", order: { by, desc: false, limit: 100 } });
    }
  }
  out.push({ type: "groups", id: "o:zero", kind: "svc", window: "cur", order: { by: "n", desc: true, limit: 0 } });
  out.push({ type: "groups", id: "f:prefix", kind: "svc", window: "cur", hist: true, filter: { prefix: "api:" } });
  out.push({ type: "groups", id: "f:prefix-ep", kind: "svc.ep", window: "cur", filter: { prefix: "api:" }, order: { by: "n", desc: true, limit: 10 } });
  out.push({ type: "groups", id: "f:parts", kind: "req.dim", window: "cur", filter: { parts: ["POST", null, "1", null] } });
  out.push({ type: "groups", id: "f:parts2", kind: "req.dim", window: "prev", filter: { parts: ["GET", null, null, null] } });
  out.push({ type: "groups", id: "f:parts-short", kind: "req.dim", window: "cur", filter: { parts: ["GET", null] } });
  out.push({ type: "groups", id: "f:svc-parts", kind: "req.svc", window: "cur", filter: { parts: [null, "GET", null, null, null] } });
  return out;
}

function seriesNeeds(): SeriesNeed[] {
  const out: SeriesNeed[] = [];
  for (const buckets of BUCKETS) {
    for (const kind of SERIES_KINDS) {
      out.push({ type: "series", id: `s:${kind}:${buckets}`, kind, window: "cur", buckets, hist: true });
      out.push({ type: "series", id: `s:${kind}:${buckets}:split`, kind, window: "prev", buckets, split: true });
    }
    out.push({ type: "series", id: `s:pvg:${buckets}`, kind: "pv.g", window: "cur", buckets, split: true, hist: true, filter: { keys: ["render", "ssr"] } });
    out.push({ type: "series", id: `s:api:${buckets}`, kind: "svc", window: "cur", buckets, filter: { prefix: "api:" } });
    out.push({ type: "series", id: `s:dim:${buckets}`, kind: "req.dim", window: "cur", buckets, filter: { parts: [null, null, "1", null] } });
  }
  return out;
}

const REQUEST_FILTERS: ListFilter[] = [
  {}, { method: "GET" }, { method: "POST" }, { status: "5xx" }, { status: "2xx" }, { status: "failed" }, { status: "x" }, { duration: "fast" },
  { duration: "slow" }, { duration: "slowest" }, { duration: "nope" }, { q: "ORDERS" }, { q: "5c0" }, { q: " req-" }, { service: "api" }, { service: "web" },
];
const SORTS = ["time", "path", "method", "status", "duration", "sql", "fetch", "service", "insights", "bogus"];

function listNeeds(traceId: string | null): ListNeed[] {
  const out: ListNeed[] = [];
  REQUEST_FILTERS.forEach((filter, i) => {
    out.push({ type: "list", id: `r:f${i}`, table: "requests", window: "cur", filter, sort: { key: "time", desc: true }, page: { page: 1, size: 7 }, aggregate: { buckets: 24 } });
    out.push({ type: "list", id: `r:f${i}:prev`, table: "requests", window: "prev", filter, sort: { key: "duration", desc: true }, limit: 5, count: true });
  });
  SORTS.forEach((key) => {
    for (const desc of [true, false]) out.push({ type: "list", id: `r:s:${key}:${desc}`, table: "requests", window: "cur", filter: {}, sort: { key, desc }, page: { page: 2, size: 4 } });
  });
  out.push({ type: "list", id: "r:last", table: "requests", window: "cur", filter: {}, sort: { key: "time", desc: true }, page: { page: 99, size: 6 } });
  out.push({ type: "list", id: "r:all", table: "requests", window: "cur", filter: {}, sort: { key: "path", desc: false } });
  if (traceId) out.push({ type: "list", id: "r:id", table: "requests", window: "cur", filter: { traceId }, sort: { key: "time", desc: true }, limit: 1 });
  for (const desc of [true, false]) {
    out.push({ type: "list", id: `t:${desc}`, table: "traces", window: "cur", filter: {}, sort: { key: "time", desc }, limit: 10, count: true });
    out.push({ type: "list", id: `l:${desc}`, table: "logs", window: "cur", filter: {}, sort: { key: "time", desc }, page: { page: 2, size: 5 } });
  }
  for (const q of ["checkout", "WEB", "5c00", "zzz"]) out.push({ type: "list", id: `t:q:${q}`, table: "traces", window: "prev", filter: { q }, sort: { key: "time", desc: true }, count: true });
  const logFilters: ListFilter[] = [{ minLevel: "warn" }, { minLevel: "error", logService: "api" }, { q: "payment" }, { q: "5C0" }, { logService: "nope" }];
  logFilters.forEach((filter, i) => out.push({ type: "list", id: `l:f${i}`, table: "logs", window: "cur", filter, sort: { key: "time", desc: true }, page: { page: 1, size: 50 } }));
  out.push({ type: "list", id: "c:top", table: "critical", window: "cur", filter: {}, sort: { key: "duration", desc: true }, limit: 25 });
  out.push({ type: "list", id: "c:prev", table: "critical", window: "prev", filter: {}, sort: { key: "duration", desc: true }, limit: 25, count: true });
  return out;
}

function traceNeeds(traceId: string | null, prevId: string | null): TraceNeed[] {
  return [
    { type: "trace", id: "x:newest", traceId: null, windows: ["cur"] },
    { type: "trace", id: "x:id", traceId, windows: ["cur", "prev"] },
    { type: "trace", id: "x:prev-only-cur", traceId: prevId, windows: ["cur"] },
    { type: "trace", id: "x:missing", traceId: "f".repeat(32), windows: ["cur", "prev"] },
  ];
}

/** The needs for one context. Keys and ids come from the memory executor, so filters hit real rows. */
export function parityNeeds(ctx: PageContext, mem: SyncExecutor): Need[] {
  const probe = mem.runSync(ROLLUP_KINDS.map((kind) => ({ type: "groups" as const, id: kind, kind, window: "cur" as const })), ctx);
  const keysOf = (kind: RollupKind) => probe.groups[kind]!.rows.map((r) => r.key);
  const lists = mem.runSync([{ type: "list", id: "c", table: "traces", window: "cur", filter: {}, sort: { key: "time", desc: false }, limit: 1 }, { type: "list", id: "p", table: "traces", window: "prev", filter: {}, sort: { key: "time", desc: true }, limit: 1 }], ctx);
  const idOf = (r: NeedResults, id: string) => (r.lists[id]!.items[0] as { traceId: string } | undefined)?.traceId ?? null;
  return [...groupNeeds(keysOf), ...seriesNeeds(), ...listNeeds(idOf(lists, "c")), ...traceNeeds(idOf(lists, "c"), idOf(lists, "p"))];
}
