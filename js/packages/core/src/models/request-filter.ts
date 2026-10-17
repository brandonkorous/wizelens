import type { RequestRow } from "../stats/requests.js";
import type { ModelParams } from "./input.js";

/** What filters and sorts read: a request row with or without its findings. */
type Row = Omit<RequestRow, "findings">;

/** Request filters, kept in the URL query so links and refreshes keep them. */
export interface RequestFilter {
  method: string;
  status: string;
  duration: string;
  service: string;
  q: string;
}

export const FILTER_KEYS = ["method", "status", "duration", "service", "q"] as const;

export const STATUS_OPTIONS: [string, string][] = [
  ["", "All Statuses"],
  ["2xx", "2xx Success"],
  ["3xx", "3xx Redirect"],
  ["4xx", "4xx Client error"],
  ["5xx", "5xx Server error"],
  ["failed", "Failed (any error)"],
];

const DURATIONS: Record<string, [string, number, number]> = {
  fast: ["Under 100 ms", 0, 100],
  medium: ["100–500 ms", 100, 500],
  slow: ["500 ms–1 s", 500, 1000],
  slowest: ["Over 1 s", 1000, Infinity],
};

export const DURATION_OPTIONS: [string, string][] = [["", "Any Duration"], ...Object.entries(DURATIONS).map(([k, [label]]): [string, string] => [k, label])];

export function filterFromQuery(query: URLSearchParams | ModelParams): RequestFilter {
  const get = (k: string) => (query instanceof URLSearchParams ? query.get(k) : query[k]) ?? "";
  return { method: get("method"), status: get("status"), duration: get("duration"), service: get("service"), q: get("q") };
}

function statusMatches(r: Row, status: string): boolean {
  if (!status) return true;
  if (status === "failed") return r.errors > 0 || (r.status ?? 0) >= 500;
  const code = r.status ?? 0;
  const hundred = Number(status[0]) * 100;
  return code >= hundred && code < hundred + 100;
}

function durationMatches(r: Row, duration: string): boolean {
  const range = DURATIONS[duration];
  return !range || (r.durationMs >= range[1] && r.durationMs < range[2]);
}

function textMatches(r: Row, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  const fields = [r.path, r.endpoint, r.user, r.requestId, r.clientAddress, ...r.tags];
  return r.traceId.startsWith(s) || fields.some((f) => f?.toLowerCase().includes(s));
}

export function applyFilter<R extends Row>(rows: readonly R[], f: RequestFilter): R[] {
  return rows.filter(
    (r) =>
      (!f.method || r.method === f.method) &&
      (!f.service || r.service === f.service || r.services.includes(f.service)) &&
      statusMatches(r, f.status) &&
      durationMatches(r, f.duration) &&
      textMatches(r, f.q.trim()),
  );
}

export const isFiltered = (f: RequestFilter): boolean => FILTER_KEYS.some((k) => f[k] !== "");

/** Distinct values for the method and service selects, sorted. */
export function optionsOf(rows: readonly Row[]): { methods: string[]; services: string[] } {
  return {
    methods: [...new Set(rows.map((r) => r.method))].sort(),
    services: [...new Set(rows.map((r) => r.service))].sort(),
  };
}

export type SortKey = "time" | "path" | "method" | "status" | "duration" | "sql" | "fetch" | "service" | "insights";

export interface Sort {
  key: SortKey;
  desc: boolean;
}

const SORT_VALUE: Record<SortKey, (r: Row) => number | string> = {
  time: (r) => r.startMs,
  path: (r) => r.path,
  method: (r) => r.method,
  status: (r) => r.status ?? 0,
  duration: (r) => r.durationMs,
  sql: (r) => r.dbCount,
  fetch: (r) => r.fetchMs,
  service: (r) => r.service,
  insights: (r) => r.insights,
};

export const isSortKey = (v: string | undefined): v is SortKey => !!v && v in SORT_VALUE;

/** Sort all rows before paging, so a sorted page shows the true top rows. */
export function sortRows<R extends Row>(rows: readonly R[], sort: Sort): R[] {
  const get = SORT_VALUE[sort.key];
  const dir = sort.desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
}
