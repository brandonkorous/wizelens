import type { ServicePageModel, VersionStat } from "@wizeworks/lens-core";
import { fmtCount, fmtDateTime, fmtMs, fmtPct } from "../../format";
import { hrefTo, navigate } from "../../routes";
import { Badge } from "../../ui/Badges";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

/** Red when a version fails more often than the one before it. */
const worse = (list: readonly VersionStat[], v: VersionStat): boolean => {
  const older = list[list.indexOf(v) + 1];
  return !!older && v.requests > 0 && older.requests > 0 && v.errorRate > older.errorRate;
};

function columns(list: readonly VersionStat[]): Column<VersionStat>[] {
  return [
    { key: "version", header: "Version", cell: (v) => <span className="wl-cell-icon"><span className="wl-mono">{v.version}</span>{v === list[0] && <Badge tone="info">Latest</Badge>}</span> },
    { key: "first", header: "Released", className: "wl-nowrap", cell: (v) => fmtDateTime(v.firstMs) },
    { key: "requests", header: "Requests", num: true, cell: (v) => fmtCount(v.requests) },
    { key: "rate", header: "Error Rate", num: true, cell: (v) => (v.requests ? <span className={worse(list, v) ? "wl-text-error" : undefined}>{fmtPct(v.errorRate * 100)}</span> : "–") },
    { key: "p95", header: "p95", num: true, cell: (v) => (v.p95Ms === null ? "–" : fmtMs(v.p95Ms)) },
    { key: "new", header: "New Errors", num: true, cell: (v) => (v.newErrors ? <span className="wl-text-error">{fmtCount(v.newErrors)}</span> : "0") },
  ];
}

/** The service's newest versions side by side. A row lists the error groups that version brought. */
export function VersionsPanel({ m, name }: { m: ServicePageModel; name: string }) {
  return (
    <Panel title={`Versions (${fmtCount(m.versions.length)})`} flush>
      <Table
        columns={columns(m.versions)}
        rows={m.versions}
        rowKey={(v) => v.version}
        onRowClick={(v) => navigate(hrefTo("errors", [], { service: name, release: v.version, status: "all" }))}
        empty={<Empty title="No versions seen">Set the app's version on the add-on (the <code>release</code> option or <code>WIZELENS_RELEASE</code>) to compare releases here.</Empty>}
      />
    </Panel>
  );
}
