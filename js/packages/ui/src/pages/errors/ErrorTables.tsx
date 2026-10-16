import { useState } from "react";
import { ArrowDown, ArrowUp, Box, Monitor } from "lucide-react";
import { type ErrorGroup, percentChange, type ServiceErrors, series } from "@wizeworks/lens-core";
import { fmtCount, fmtPct, fmtTime } from "../../format";
import { setQuery } from "../../routes";
import { DotText } from "../../ui/Badges";
import { Empty, Panel } from "../../ui/Panel";
import { Sparkline } from "../../ui/Sparkline";
import { type Column, Table } from "../../ui/Table";
import type { ErrorStats } from "./useErrorStats";

const TOP = 5;
const TREND_BUCKETS = 16;

const pathOf = (endpoint: string) => endpoint.replace(/^[A-Z]+ /, "");

const GROUP_COLUMNS: Column<ErrorGroup>[] = [
  { key: "time", header: "Time", className: "wl-nowrap", sort: (g) => g.lastSeenMs, cell: (g) => fmtTime(g.lastSeenMs) },
  { key: "status", header: "Status", cell: (g) => <DotText tone="danger" colorText>{g.critical ? "Critical" : "Error"}</DotText> },
  { key: "error", header: "Error", className: "wl-err-text", cell: (g) => <span className="wl-truncate" title={`${g.type}: ${g.message}`}>{g.type}: {g.message}</span> },
  { key: "endpoint", header: "Endpoint", className: "wl-err-endpoint", cell: (g) => <span className="wl-truncate" title={g.endpoint}>{pathOf(g.endpoint)}</span> },
  { key: "service", header: "Service", className: "wl-nowrap", cell: (g) => g.service },
  { key: "count", header: "Count", num: true, sort: (g) => g.count, cell: (g) => fmtCount(g.count) },
];

export function RecentExceptionsPanel({ stats, selected }: { stats: ErrorStats; selected: string | null }) {
  const [all, setAll] = useState(false);
  const rows = all ? stats.groups : stats.groups.slice(0, TOP);
  const toggle = stats.groups.length > TOP && (
    <button type="button" className="wl-view-all wl-link-btn" onClick={() => setAll(!all)}>
      {all ? `Show latest ${TOP}` : `View all ${stats.groups.length}`}
    </button>
  );
  return (
    <Panel title="Recent Exceptions" action={toggle}>
      <Table
        columns={GROUP_COLUMNS}
        rows={rows}
        rowKey={(g) => g.key}
        selectedKey={selected}
        onRowClick={(g) => setQuery({ group: g.key })}
        empty={<Empty title="No exceptions">Nothing failed in this time range.</Empty>}
      />
    </Panel>
  );
}

function Change({ now, before }: { now: number; before: number }) {
  const pct = percentChange(now, before);
  if (pct === null) return <span className="wl-muted">–</span>;
  const Arrow = pct >= 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`wl-err-change ${pct > 0 ? "wl-text-error" : "wl-text-ok"}`}>
      <Arrow aria-hidden="true" />
      {fmtPct(Math.abs(pct))}
    </span>
  );
}

function serviceColumns(stats: ErrorStats): Column<ServiceErrors>[] {
  const prev = (s: string) => stats.prevEvents.filter((e) => e.service === s).length;
  const trend = (s: string) => series(stats.events.filter((e) => e.service === s), (e) => e.timeMs, stats.w.window, TREND_BUCKETS);
  return [
    { key: "service", header: "Service", cell: (s) => <span className="wl-cell-icon">{s.service === "Web App" ? <Monitor aria-hidden="true" /> : <Box aria-hidden="true" />}{s.service}</span> },
    { key: "exceptions", header: "Exceptions", num: true, sort: (s) => s.exceptions, cell: (s) => fmtCount(s.exceptions) },
    { key: "rate", header: "Error Rate", num: true, sort: (s) => s.errorRate, cell: (s) => (s.requests ? fmtPct(s.errorRate) : "–") },
    { key: "trend", header: "Trend", cell: (s) => <Sparkline values={trend(s.service)} width={110} height={24} color="var(--wl-red)" /> },
    { key: "change", header: "", num: true, cell: (s) => <Change now={s.exceptions} before={prev(s.service)} /> },
  ];
}

export function ErrorsByServicePanel({ stats }: { stats: ErrorStats }) {
  return (
    <Panel title="Errors by Service">
      <Table columns={serviceColumns(stats)} rows={stats.services} rowKey={(s) => s.service} empty={<Empty>No services seen yet.</Empty>} />
    </Panel>
  );
}
