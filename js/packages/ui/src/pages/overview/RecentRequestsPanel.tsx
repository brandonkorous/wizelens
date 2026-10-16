import type { RequestRow } from "@wizeworks/lens-core";
import { fmtMs } from "../../format";
import { hrefTo, navigate } from "../../routes";
import { CountBadge, DotText, toneOfStatus } from "../../ui/Badges";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

const MAX_ROWS = 5;

const COLUMNS: Column<RequestRow>[] = [
  { key: "path", header: "Path", cell: (r) => <span className="wl-ov-path wl-truncate" title={r.path}>{r.path}</span> },
  { key: "method", header: "Method", cell: (r) => r.method },
  { key: "status", header: "Status", cell: (r) => <DotText tone={toneOfStatus(r.status)}>{r.status ?? "…"}</DotText> },
  { key: "duration", header: "Duration", cell: (r) => fmtMs(r.durationMs), className: "wl-nowrap" },
  { key: "sql", header: "SQL", cell: (r) => r.dbCount },
  { key: "insights", header: "Insights", cell: (r) => <CountBadge n={r.insights} /> },
];

/** The newest requests. A click opens the request on the Requests page. */
export function RecentRequestsPanel({ rows }: { rows: readonly RequestRow[] }) {
  return (
    <Panel title="Recent Requests" action={<ViewAll href={hrefTo("requests")} />}>
      <Table
        columns={COLUMNS}
        rows={rows.slice(0, MAX_ROWS)}
        rowKey={(r) => r.traceId}
        onRowClick={(r) => navigate(hrefTo("requests", [], { trace: r.traceId }))}
        empty={<Empty>No requests in this range.</Empty>}
      />
    </Panel>
  );
}
