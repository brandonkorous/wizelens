import { ArrowDown, ArrowUp } from "lucide-react";
import { isFailed, type RequestRow } from "@wizeworks/lens-core";
import { fmtMs, fmtTime } from "../../format";
import { CountBadge, DotText, toneOfStatus } from "../../ui/Badges";
import type { Column } from "../../ui/Table";

export type SortKey = "time" | "path" | "method" | "status" | "duration" | "sql" | "fetch" | "service" | "insights";
export interface Sort {
  key: SortKey;
  desc: boolean;
}

const SORT_VALUE: Record<SortKey, (r: RequestRow) => number | string> = {
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

/** Sort all rows before paging, so a sorted page shows the true top rows. */
export function sortRows(rows: readonly RequestRow[], sort: Sort): RequestRow[] {
  const get = SORT_VALUE[sort.key];
  const dir = sort.desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
}

function SortHeader({ label, k, sort, onSort }: { label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  const Arrow = sort.desc ? ArrowDown : ArrowUp;
  return (
    <button type="button" onClick={() => onSort(k)} aria-label={`Sort by ${label}`}>
      {label}
      {active && <Arrow aria-hidden="true" />}
    </button>
  );
}

const durationCell = (r: RequestRow) => <span className={isFailed(r) ? "wl-text-error" : undefined}>{fmtMs(r.durationMs)}</span>;

/** The request table columns. Headers sort the full list through `onSort`. */
export function requestColumns(sort: Sort, onSort: (k: SortKey) => void): Column<RequestRow>[] {
  const h = (label: string, k: SortKey) => <SortHeader label={label} k={k} sort={sort} onSort={onSort} />;
  return [
    { key: "time", header: h("Time", "time"), cell: (r) => fmtTime(r.startMs), className: "wl-nowrap" },
    { key: "path", header: h("Path", "path"), cell: (r) => <span className="wl-rq-path wl-truncate" title={r.path}>{r.path}</span> },
    { key: "method", header: h("Method", "method"), cell: (r) => r.method },
    { key: "status", header: h("Status", "status"), cell: (r) => <DotText tone={toneOfStatus(r.status)} colorText={(r.status ?? 0) >= 500}>{r.status ?? "…"}</DotText> },
    { key: "duration", header: h("Duration", "duration"), cell: durationCell, className: "wl-nowrap" },
    { key: "sql", header: h("SQL", "sql"), cell: (r) => r.dbCount },
    { key: "fetch", header: h("Fetch", "fetch"), cell: (r) => (r.fetchCount ? fmtMs(r.fetchMs) : "–"), className: "wl-nowrap" },
    { key: "service", header: h("Service", "service"), cell: (r) => r.service },
    { key: "insights", header: h("Insights", "insights"), cell: (r) => <CountBadge n={r.insights} /> },
  ];
}
