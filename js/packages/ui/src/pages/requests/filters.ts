import type { RequestRow } from "@wizeworks/lens-core";

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

export function filterFromQuery(query: URLSearchParams): RequestFilter {
  const get = (k: string) => query.get(k) ?? "";
  return { method: get("method"), status: get("status"), duration: get("duration"), service: get("service"), q: get("q") };
}

function statusMatches(r: RequestRow, status: string): boolean {
  if (!status) return true;
  if (status === "failed") return r.errors > 0 || (r.status ?? 0) >= 500;
  const code = r.status ?? 0;
  const hundred = Number(status[0]) * 100;
  return code >= hundred && code < hundred + 100;
}

function durationMatches(r: RequestRow, duration: string): boolean {
  const range = DURATIONS[duration];
  return !range || (r.durationMs >= range[1] && r.durationMs < range[2]);
}

function textMatches(r: RequestRow, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  const fields = [r.path, r.endpoint, r.user, r.requestId, r.clientAddress, ...r.tags];
  return r.traceId.startsWith(s) || fields.some((f) => f?.toLowerCase().includes(s));
}

export function applyFilter(rows: readonly RequestRow[], f: RequestFilter): RequestRow[] {
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
export function optionsOf(rows: readonly RequestRow[]): { methods: string[]; services: string[] } {
  return {
    methods: [...new Set(rows.map((r) => r.method))].sort(),
    services: [...new Set(rows.map((r) => r.service))].sort(),
  };
}
