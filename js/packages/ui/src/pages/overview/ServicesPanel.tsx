import { Box, Cog, Database, Globe, Inbox, Monitor } from "lucide-react";
import { type ServiceKind, type ServiceRow, type ServiceStatus, serviceDoc, type TimeRange } from "@wizeworks/lens-core";
import { useGroupTags } from "../../data/tagMatch";
import { withTags } from "../../ui/TagChips";
import { fmtCount, fmtMs } from "../../format";
import { hrefTo, navigate } from "../../routes";
import { DotText, type Tone } from "../../ui/Badges";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { serviceHref } from "../services/serviceParts";

const KIND_ICON: Record<ServiceKind, typeof Box> = { api: Box, web: Monitor, worker: Cog, queue: Inbox, database: Database, external: Globe };
const STATUS: Record<ServiceStatus, [Tone, string]> = {
  healthy: ["success", "Healthy"],
  degraded: ["warning", "Degraded"],
  unhealthy: ["danger", "Unhealthy"],
  idle: ["neutral", "Idle"],
};
const MAX_ROWS = 5;

function columns(range: TimeRange | null): Column<ServiceRow>[] {
  return [
    {
      key: "name",
      header: "Service",
      className: "wl-fill",
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
    { key: "requests", header: range ? `Requests (${range})` : "Requests", cell: (s) => fmtCount(s.requests), className: "wl-nowrap" },
  ];
}

/** The busiest services and databases with their health. */
export function ServicesPanel({ rows, range }: { rows: readonly ServiceRow[]; range: TimeRange | null }) {
  const groupTags = useGroupTags();
  const cols = withTags(columns(range), "name", (s) => groupTags("services", serviceDoc(s.name)));
  return (
    <Panel title="Services" action={<ViewAll href={hrefTo("services")} />}>
      <Table
        columns={cols}
        rows={rows.slice(0, MAX_ROWS)}
        rowKey={(s) => s.key}
        onRowClick={(s) => navigate(serviceHref(s.key))}
        empty={<Empty>No services seen in this range.</Empty>}
      />
    </Panel>
  );
}
