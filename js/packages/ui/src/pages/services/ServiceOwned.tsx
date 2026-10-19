// Panels only your own services (APIs and workers) have: errors, slow requests, logs, and runtime metrics.
import { useState } from "react";
import { type ErrorGroup, isFailed, type LogRow, type RequestItem, type ServicePageModel } from "@wizeworks/lens-core";
import { useData } from "../../data/hooks";
import { useMetricsModel } from "../../data/metrics";
import { fmtAgo, fmtCount, fmtMs } from "../../format";
import { errorHref, hrefTo, navigate, traceHref } from "../../routes";
import { DotText, toneOfStatus } from "../../ui/Badges";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { Sparkline } from "../../ui/Sparkline";
import { type Column, Table } from "../../ui/Table";
import { LOG_COLUMNS } from "../logs/LogParts";
import { ToggleAll, TOP } from "./ServiceTables";
import "../../styles/pages/logs.css";
import "../../styles/pages/metrics.css";

const pathOf = (endpoint: string) => endpoint.replace(/^[A-Z]+ /, "");

function errorColumns(now: number): Column<ErrorGroup>[] {
  return [
    { key: "error", header: "Error", className: "wl-svc-wide", cell: (g) => <span className="wl-truncate" title={`${g.type}: ${g.message}`}>{g.type}: {g.message}</span> },
    { key: "endpoint", header: "Endpoint", className: "wl-svc-mid", cell: (g) => <span className="wl-truncate" title={g.endpoint}>{pathOf(g.endpoint)}</span> },
    { key: "seen", header: "Last Seen", className: "wl-nowrap", sort: (g) => g.lastSeenMs, cell: (g) => fmtAgo(g.lastSeenMs, now) },
    { key: "count", header: "Count", num: true, sort: (g) => g.count, cell: (g) => fmtCount(g.count) },
  ];
}

/** The service's most frequent errors. A row opens it on the Errors page. */
export function ErrorsPanel({ m, name }: { m: ServicePageModel; name: string }) {
  const { updatedMs } = useData();
  const [all, setAll] = useState(false);
  const { groups, total } = m.errors;
  const action = (
    <span className="wl-row-actions">
      <ToggleAll open={all} total={groups.length} onToggle={() => setAll(!all)} />
      <ViewAll href={hrefTo("errors", [], { service: name })} label="View errors" />
    </span>
  );
  return (
    <Panel title={`Top Errors (${fmtCount(total)})`} action={action} flush>
      <Table columns={errorColumns(updatedMs)} rows={all ? groups : groups.slice(0, TOP)} rowKey={(g) => g.key} onRowClick={(g) => navigate(errorHref(g.key))} empty={<Empty title="No exceptions">Nothing failed in this time range.</Empty>} />
    </Panel>
  );
}

const SLOW_COLUMNS: Column<RequestItem>[] = [
  { key: "path", header: "Request", className: "wl-svc-wide", cell: (r) => <span className="wl-truncate" title={`${r.method} ${r.path}`}>{r.method} {r.path}</span> },
  { key: "status", header: "Status", cell: (r) => <DotText tone={toneOfStatus(r.status)} colorText={(r.status ?? 0) >= 500}>{r.aborted ? "Aborted" : (r.status ?? "…")}</DotText> },
  { key: "duration", header: "Duration", num: true, sort: (r) => r.durationMs, cell: (r) => <span className={isFailed(r) ? "wl-text-error" : undefined}>{fmtMs(r.durationMs)}</span> },
];

/** The slowest requests that went through this service. A row opens the trace. */
export function SlowestPanel({ m, name }: { m: ServicePageModel; name: string }) {
  const action = m.requestCount > 0 && <ViewAll href={hrefTo("requests", [], { service: name, sort: "duration" })} label={`View all ${fmtCount(m.requestCount)}`} />;
  return (
    <Panel title="Slowest Requests" action={action} flush>
      <Table columns={SLOW_COLUMNS} rows={m.slowest} rowKey={(r) => r.traceId} onRowClick={(r) => navigate(traceHref(r.traceId))} empty={<Empty title="No requests">No request went through this service in this range.</Empty>} />
    </Panel>
  );
}

// The service is the page's own, and a category here is plain text (the Logs page filters by it).
const SERVICE_LOG_COLUMNS = LOG_COLUMNS.filter((c) => c.key !== "service").map((c) =>
  c.key === "category" ? { ...c, cell: (r: LogRow) => <span className="wl-truncate" title={r.category}>{r.category}</span> } : c,
);

/** The newest log lines of this service, with its warning and error counts. */
export function LogsPanel({ m, name }: { m: ServicePageModel; name: string }) {
  const { total, warnings, errors, rows } = m.logs;
  const action = (
    <span className="wl-row-actions">
      {total > 0 && <span className="wl-muted wl-small">{fmtCount(warnings)} warnings · {fmtCount(errors)} errors</span>}
      <ViewAll href={hrefTo("logs", [], { service: name })} label={total > 0 ? `View all ${fmtCount(total)}` : "View logs"} />
    </span>
  );
  return (
    <Panel title="Recent Logs" action={action} flush className="wl-svc-logs">
      <Table columns={SERVICE_LOG_COLUMNS} rows={rows} rowKey={(r) => r.key} empty={<Empty title="No log lines">Lines this service writes through WizeLens loggers show up here.</Empty>} />
    </Panel>
  );
}

/** CPU, memory, and more from the service's runtime metrics. A tile opens it on the Metrics page. */
export function RuntimePanel({ name }: { name: string }) {
  const { model } = useMetricsModel({ service: name });
  const stats = model?.runtime.find((r) => r.service === name)?.stats ?? [];
  if (stats.length === 0) return null;
  return (
    <Panel title="Runtime" action={<ViewAll href={hrefTo("metrics", [], { service: name })} label="View metrics" />} className="wl-svc-runtime">
      <div className="wl-metric-tiles">
        {stats.map((s) => (
          <a key={s.key} className="wl-metric-tile" href={hrefTo("metrics", [], { metric: s.metric, service: name })} title={s.metric}>
            <span>{s.label}</span>
            <strong>{s.lastText}</strong>
            <Sparkline values={s.spark} width={240} height={28} stretch />
          </a>
        ))}
      </div>
    </Panel>
  );
}
