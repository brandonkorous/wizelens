import type { OverviewModel } from "@wizeworks/lens-core/internal";
import { fmtCount, fmtTime } from "../../format";
import { errorHref, hrefTo, navigate } from "../../routes";
import { Badge } from "../../ui/Badges";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

type Row = OverviewModel["freshErrors"][number];

const COLUMNS: Column<Row>[] = [
  { key: "why", header: "Status", cell: (r) => (r.why === "new" ? <Badge tone="info">New</Badge> : <Badge tone="danger">Regressed</Badge>) },
  { key: "error", header: "Error", className: "wl-cell-wide", cell: (r) => <span className="wl-truncate" title={`${r.group.type}: ${r.group.message}`}>{r.group.type}: {r.group.message}</span> },
  { key: "service", header: "Service", className: "wl-nowrap", cell: (r) => r.group.service },
  { key: "count", header: "Count", num: true, cell: (r) => fmtCount(r.group.count) },
  { key: "last", header: "Last seen", className: "wl-nowrap", cell: (r) => fmtTime(r.group.lastSeenMs) },
];

/** Errors first seen in this range, and resolved errors that came back. A click opens the error's page. */
export function FreshErrorsPanel({ rows }: { rows: OverviewModel["freshErrors"] }) {
  return (
    <Panel title="New and Regressed Errors" action={<ViewAll href={hrefTo("errors", [], { new: "1" })} label="View new errors" />}>
      <Table columns={COLUMNS} rows={rows} rowKey={(r) => r.group.key} onRowClick={(r) => navigate(errorHref(r.group.key))} empty={<Empty>No new or regressed errors in this range.</Empty>} />
    </Panel>
  );
}
