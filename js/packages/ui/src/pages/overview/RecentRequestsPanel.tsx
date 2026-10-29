import { useMemo } from "react";
import type { RequestItem } from "@wizeworks/lens-core";
import { fmtMs } from "../../format";
import { MidPath } from "../../ui/MidPath";
import { hrefTo, navigate } from "../../routes";
import { CountBadge, DotText, toneOfStatus } from "../../ui/Badges";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { withTags } from "../../ui/TagChips";
import { traceRow, useRowTags } from "../../data/tagMatch";

const MAX_ROWS = 5;

const COLUMNS: Column<RequestItem>[] = [
  { key: "path", header: "Path", cell: (r) => <MidPath path={r.path} className="wl-ov-path" /> },
  { key: "method", header: "Method", cell: (r) => r.method },
  { key: "status", header: "Status", cell: (r) => <DotText tone={toneOfStatus(r.status)}>{r.status ?? "…"}</DotText> },
  { key: "duration", header: "Duration", cell: (r) => fmtMs(r.durationMs), className: "wl-nowrap" },
  { key: "sql", header: "SQL", cell: (r) => r.dbCount },
  { key: "insights", header: "Insights", cell: (r) => <CountBadge n={r.insights} /> },
];

/** The newest requests. A click opens the request on the Requests page. */
export function RecentRequestsPanel({ rows }: { rows: readonly RequestItem[] }) {
  const shown = useMemo(() => rows.slice(0, MAX_ROWS), [rows]);
  const tagsOf = useRowTags("requests", shown, traceRow);
  return (
    <Panel title="Recent Requests" action={<ViewAll href={hrefTo("requests")} />}>
      <Table
        columns={withTags(COLUMNS, "path", tagsOf)}
        rows={shown}
        rowKey={(r) => r.traceId}
        onRowClick={(r) => navigate(hrefTo("requests", [], { trace: r.traceId }))}
        empty={<Empty>No requests in this range.</Empty>}
      />
    </Panel>
  );
}
