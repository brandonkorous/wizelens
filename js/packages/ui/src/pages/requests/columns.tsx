import { ArrowDown, ArrowUp } from "lucide-react";
import { isFailed, type RequestItem, type Sort, type SortKey } from "@wizeworks/lens-core/internal";
import { fmtMs, fmtTime } from "../../format";
import { MidPath } from "../../ui/MidPath";
import { CountBadge, DotText, toneOfStatus } from "../../ui/Badges";
import type { Column } from "../../ui/Table";

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

const durationCell = (r: RequestItem) => <span className={isFailed(r) ? "wl-text-error" : undefined}>{fmtMs(r.durationMs)}</span>;

/** The request table columns. Headers sort the full list through `onSort`. */
export function requestColumns(sort: Sort, onSort: (k: SortKey) => void): Column<RequestItem>[] {
  const h = (label: string, k: SortKey) => <SortHeader label={label} k={k} sort={sort} onSort={onSort} />;
  return [
    { key: "time", header: h("Time", "time"), label: "Time", cell: (r) => fmtTime(r.startMs), className: "wl-nowrap" },
    { key: "path", header: h("Path", "path"), label: "Path", cardTitle: true, cell: (r) => <MidPath path={r.path} className="wl-rq-path" /> },
    { key: "method", header: h("Method", "method"), label: "Method", cell: (r) => r.method },
    { key: "status", header: h("Status", "status"), label: "Status", cell: (r) => <DotText tone={toneOfStatus(r.status)} colorText={(r.status ?? 0) >= 500 && !r.expected}>{r.aborted ? "Aborted" : (r.status ?? "…")}</DotText> },
    { key: "duration", header: h("Duration", "duration"), label: "Duration", cell: durationCell, className: "wl-nowrap" },
    { key: "sql", header: h("SQL", "sql"), label: "SQL", cell: (r) => r.dbCount },
    { key: "db", header: h("DB Time", "db"), label: "DB Time", cell: (r) => (r.dbCount ? fmtMs(r.dbMs) : "–"), className: "wl-nowrap" },
    { key: "errors", header: h("Errors", "errors"), label: "Errors", cell: (r) => <CountBadge n={r.errors} /> },
    { key: "fetch", header: h("Fetch", "fetch"), label: "Fetch", cell: (r) => (r.fetchCount ? fmtMs(r.fetchMs) : "–"), className: "wl-nowrap" },
    { key: "service", header: h("Service", "service"), label: "Service", cell: (r) => r.service, className: "wl-nowrap" },
    { key: "insights", header: h("Insights", "insights"), label: "Insights", cell: (r) => <CountBadge n={r.insights} /> },
  ];
}
