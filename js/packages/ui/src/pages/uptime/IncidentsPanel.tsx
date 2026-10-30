import { incidentMs, type UptimeIncidentView } from "@wizeworks/lens-core/internal";
import { fmtDateTime } from "../../format";
import { hrefTo } from "../../routes";
import { Badge } from "../../ui/Badges";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { fmtLength } from "./uptimeParts";

function columns(nowMs: number, withCheck: boolean): Column<UptimeIncidentView>[] {
  return [
    { key: "state", header: "", srHeader: "State", cell: (i) => (i.endMs === null ? <Badge tone="danger">Ongoing</Badge> : <Badge tone="success">Resolved</Badge>) },
    ...(withCheck ? [{ key: "check", header: "Check", cell: (i: UptimeIncidentView) => <a href={hrefTo("uptime", [i.checkId])}>{i.checkName}</a> }] : []),
    { key: "start", header: "Started", className: "wl-nowrap", sort: (i) => i.startMs, cell: (i) => fmtDateTime(i.startMs) },
    { key: "length", header: "Down For", num: true, sort: (i) => incidentMs(i, nowMs), cell: (i) => fmtLength(incidentMs(i, nowMs)) },
    { key: "reason", header: "Reason", className: "wl-wrap", cell: (i) => i.reason },
  ];
}

/** Times checks were down, newest first. */
export function IncidentsPanel({ incidents, nowMs, withCheck = true }: { incidents: readonly UptimeIncidentView[]; nowMs: number; withCheck?: boolean }) {
  return (
    <Panel title="Incidents" flush>
      <Table paging={{ noun: "incidents", key: "incidents" }} columns={columns(nowMs, withCheck)} rows={incidents} rowKey={(i) => i.id} empty={<Empty>No incidents in the last 90 days.</Empty>} defaultSort={{ key: "start", desc: true }} />
    </Panel>
  );
}
