// Normalizations before comparing a new model with a legacy one. Test-only: excluded from the build.
type Obj = Record<string, unknown>;

/** A JSON copy, so both sides have the same shape (no undefined fields, plain objects). */
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const withoutFindings = (r: unknown): unknown => {
  if (r === null || typeof r !== "object") return r;
  const { findings: _findings, ...rest } = r as Obj;
  return rest;
};

/** Requests rows lose their findings: pages send `RequestItem`s now. */
function stripRequests(m: Obj): void {
  if (Array.isArray(m.recent) && m.recent.every((r) => typeof r === "object" && r !== null && "endpoint" in r)) m.recent = m.recent.map(withoutFindings);
  if (Array.isArray(m.rows) && m.rows.every((r) => typeof r === "object" && r !== null && "endpoint" in r && "method" in r)) m.rows = m.rows.map(withoutFindings);
  if (m.selected && typeof m.selected === "object" && "endpoint" in (m.selected as Obj)) m.selected = withoutFindings(m.selected);
}

type Key = (x: Obj) => number | string;

/** Sort by keys in order; numbers are rounded so sums in another order still tie. */
function sortBy(list: unknown, ...keys: Key[]): unknown {
  if (!Array.isArray(list)) return list;
  const val = (x: Obj, k: Key) => {
    const v = k(x);
    return typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v;
  };
  return [...(list as Obj[])].sort((a, b) => {
    for (const k of keys) {
      const x = val(a, k);
      const y = val(b, k);
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  });
}

const num = (k: string): Key => (x) => -(x[k] as number);
const str = (k: string): Key => (x) => String(x[k]);

/** Rows that tie on what a page sorts by may come in another order: put them in one order on both sides. */
const TIES: Record<string, (m: Obj) => void> = {
  traces: (m) => {
    // The filter and paging are new; the legacy model had none.
    for (const k of ["filter", "page", "size"]) delete m[k];
    m.critical = sortBy(m.critical, num("durationMs"), str("traceId"), str("spanId"));
  },
  insights: (m) => {
    // Issue states are new; the legacy model had none.
    for (const k of ["issues", "hasIssues"]) delete m[k];
  },
  overview: (m) => {
    // The compared period's line is new; the legacy model had none.
    delete (m.activity as Obj).prevRequests;
    delete m.freshErrors;
  },
  requests: (m) => {
    // Service options carry display names now ("Web App", not "browser").
    const o = m.options as { services: string[] };
    o.services = [...new Set(o.services.map((s) => (s === "browser" ? "Web App" : s)))].sort();
  },
  logs: (m) => {
    // The exact level, category, and trace filters are new; the legacy filter had none.
    const f = m.filter as Obj;
    for (const k of ["exact", "category", "traceId"]) delete f[k];
  },
  rendering: (m) => {
    // The route count is new; the legacy model had none.
    delete m.routeCount;
  },
  database: (m) => {
    // The table count, the filter, paging, and database options are new; the legacy model had none.
    for (const k of ["tableCount", "filter", "page", "size", "databases"]) delete m[k];
    m.queries = sortBy(m.queries, num("avgMs"), str("key"));
    m.tables = sortBy(m.tables, num("queries"), str("table"));
  },
  errors: (m) => {
    m.services = sortBy(m.services, num("exceptions"), num("requests"), str("service"));
    // The selected group, the filter, paging, and endpoint options are new; the legacy model had none.
    for (const k of ["selected", "groupCount", "filter", "page", "size", "endpoints", "issues", "hasIssues"]) delete m[k];
    delete (m.chart as Obj).prev;
  },
  services: (m) => {
    m.rows = sortBy(m.rows, num("requests"), str("key"));
    // Edges come busiest first now (legacy: as first seen), and only stats tables give their p95.
    m.edges = sortBy((m.edges as Obj[]).map(({ p95Ms: _p, ...e }) => e), str("from"), str("to"));
    const sel = m.selected as Obj | null;
    if (!sel) return;
    sel.incoming = sortBy((sel.incoming as Obj[]).map(({ p95Ms: _p, ...e }) => e), str("from"), str("to"));
    sel.outgoing = sortBy((sel.outgoing as Obj[]).map(({ p95Ms: _p, ...e }) => e), str("from"), str("to"));
    sel.endpoints = sortBy(sel.endpoints, num("count"), str("name"));
  },
};

/** The model as plain JSON, without meta fields the legacy models do not have. */
export function normalizeModel(page: string, model: unknown): Obj {
  const m = copy(model) as Obj;
  if (m.meta && typeof m.meta === "object") {
    // Settling and sampling vary by host; custom windows and compare are new since the legacy models.
    for (const k of ["settling", "sampled", "custom", "compare"]) delete (m.meta as Obj)[k];
  }
  stripRequests(m);
  TIES[page]?.(m);
  return m;
}
