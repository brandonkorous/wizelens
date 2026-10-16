import { useMemo } from "react";
import { Box, Cog, Database, Globe, Inbox, Monitor } from "lucide-react";
import { serviceRows, type ServiceKind, type ServiceRow, type ServiceStatus, type TimeRange, type Trace } from "@wizeworks/lens-core";
import { fmtCount, fmtMs } from "../../format";
import { hrefTo, navigate } from "../../routes";
import { DotText, type Tone } from "../../ui/Badges";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

const KIND_ICON: Record<ServiceKind, typeof Box> = { api: Box, web: Monitor, worker: Cog, queue: Inbox, database: Database, external: Globe };
const STATUS: Record<ServiceStatus, [Tone, string]> = {
  healthy: ["success", "Healthy"],
  degraded: ["warning", "Degraded"],
  unhealthy: ["danger", "Unhealthy"],
  idle: ["neutral", "Idle"],
};
const MAX_ROWS = 5;

function columns(range: TimeRange): Column<ServiceRow>[] {
  return [
    {
      key: "name",
      header: "Service",
      cell: (s) => {
        const Icon = KIND_ICON[s.kind];
        return (
          <span className="wl-cell-icon" title={s.detail ?? s.name}>
            <Icon aria-hidden="true" />
            <span className="wl-truncate">{s.name}</span>
          </span>
        );
      },
    },
    { key: "status", header: "Status", cell: (s) => <DotText tone={STATUS[s.status][0]} colorText>{STATUS[s.status][1]}</DotText> },
    { key: "avg", header: "Avg Latency", cell: (s) => fmtMs(s.avgMs), className: "wl-nowrap" },
    { key: "requests", header: `Requests (${range})`, cell: (s) => fmtCount(s.requests), className: "wl-nowrap" },
  ];
}

/** The busiest services and databases with their health. */
export function ServicesPanel({ traces, range }: { traces: readonly Trace[]; range: TimeRange }) {
  const rows = useMemo(() => serviceRows(traces).slice(0, MAX_ROWS), [traces]);
  const cols = useMemo(() => columns(range), [range]);
  return (
    <Panel title="Services" action={<ViewAll href={hrefTo("services")} />}>
      <Table
        columns={cols}
        rows={rows}
        rowKey={(s) => s.key}
        onRowClick={(s) => navigate(hrefTo("services", [], { service: s.name }))}
        empty={<Empty>No services seen in this range.</Empty>}
      />
    </Panel>
  );
}
