import { Gauge, Timer, TriangleAlert, Waypoints } from "lucide-react";
import { type EndpointPageModel, type EndpointPart, type ErrorGroup, isFailed, percentChange, type RequestItem } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { compareSeriesLabel, fmtAgo, fmtCount, fmtMs, fmtPct } from "../../format";
import { errorHref, hrefTo, navigate, queryHref, traceHref } from "../../routes";
import { DotText, toneOfStatus } from "../../ui/Badges";
import { DetailHead } from "../../ui/DetailHead";
import { ModelState } from "../../ui/ModelState";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { type Column, Table } from "../../ui/Table";
import { TimeChart } from "../../ui/TimeChart";
import { serviceHref } from "./serviceParts";
import "../../styles/pages/services.css";

const ERROR_BARS = "color-mix(in srgb, var(--wl-red) 45%, transparent)";

const partColumns = (header: string): Column<EndpointPart>[] => [
  { key: "name", header, className: "wl-cell-wide", cell: (p) => <span className="wl-truncate wl-mono" title={p.name}>{p.name}</span> },
  { key: "count", header: "Count", num: true, sort: (p) => p.count, cell: (p) => fmtCount(p.count) },
  { key: "avg", header: "Avg", num: true, sort: (p) => p.avgMs ?? 0, cell: (p) => fmtMs(p.avgMs) },
  { key: "errors", header: "Errors", num: true, sort: (p) => p.errors, cell: (p) => <span className={p.errors ? "wl-text-error" : undefined}>{fmtCount(p.errors)}</span> },
];

const REQUEST_COLUMNS: Column<RequestItem>[] = [
  { key: "path", header: "Request", className: "wl-cell-wide", cell: (r) => <span className="wl-truncate" title={r.path}>{r.method} {r.path}</span> },
  { key: "status", header: "Status", cell: (r) => <DotText tone={toneOfStatus(r.status)}>{r.status ?? "–"}</DotText> },
  { key: "duration", header: "Duration", num: true, cell: (r) => <span className={isFailed(r) ? "wl-text-error" : undefined}>{fmtMs(r.durationMs)}</span> },
];

const errorColumns = (now: number): Column<ErrorGroup>[] => [
  { key: "error", header: "Error", className: "wl-cell-wide", cell: (g) => <span className="wl-truncate" title={g.message}>{g.type}: {g.message}</span> },
  { key: "seen", header: "Last Seen", className: "wl-nowrap", cell: (g) => fmtAgo(g.lastSeenMs, now) },
  { key: "count", header: "Count", num: true, cell: (g) => fmtCount(g.count) },
];

function Cards({ m }: { m: EndpointPageModel }) {
  const t = m.totals!;
  const change = (a: number | null, b: number | null | undefined) => (m.meta.hasPrev ? percentChange(a, b ?? 0) : null);
  const rate = m.chart.count.map((n, i) => (n ? ((m.chart.errors[i] ?? 0) / n) * 100 : null));
  const common = { compareLabel: m.meta.compareLabel };
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Gauge} label="Requests" value={fmtCount(t.count)} change={change(t.count, m.prev?.count)} upIsGood series={m.chart.count} {...common} />
      <StatCard icon={TriangleAlert} label="Error Rate" value={fmtPct(t.errorRate)} change={change(t.errorRate, m.prev?.errorRate)} upIsGood={false} series={rate} danger {...common} />
      <StatCard icon={Timer} label="p95 Latency" value={fmtMs(t.p95Ms)} change={change(t.p95Ms, m.prev?.p95Ms)} upIsGood={false} series={m.chart.p95} {...common} />
      <StatCard icon={Timer} label="p99 Latency" value={fmtMs(t.p99Ms)} change={change(t.p99Ms, m.prev?.p99Ms)} upIsGood={false} series={m.chart.p99} {...common} />
    </div>
  );
}

function Charts({ m }: { m: EndpointPageModel }) {
  const prev = { label: compareSeriesLabel(m.meta.compare), values: m.chart.prevCount, color: "var(--wl-slate)", dashed: true };
  const latency = [
    { label: "p99", values: m.chart.p99, color: "var(--wl-red)" },
    { label: "p95", values: m.chart.p95, color: "var(--wl-orange)" },
    { label: "p50", values: m.chart.p50, color: "var(--wl-blue)" },
  ];
  return (
    <div className="wl-grid wl-grid-2-even">
      <Panel title="Requests Over Time">
        <TimeChart starts={m.starts} lines={[{ label: "Requests", values: m.chart.count, color: "var(--wl-blue)" }, prev]} bars={[{ label: "Errors", values: m.chart.errors, color: ERROR_BARS }]} height={220} separateBarScale format={fmtCount} />
      </Panel>
      <Panel title="Latency Over Time">
        <TimeChart starts={m.starts} lines={latency} height={220} format={(v) => fmtMs(v)} />
      </Panel>
    </div>
  );
}

function Lists({ m }: { m: EndpointPageModel }) {
  const requests = m.slowest.length ? m.slowest : m.recent;
  const viewAll = <ViewAll href={hrefTo("requests", [], { endpoint: m.endpoint, service: m.service, sort: "duration" })} label="View requests" />;
  return (
    <>
      <div className="wl-grid wl-grid-2-even">
        <Panel title={`Queries (${fmtCount(m.queries.length)})`} flush><Table columns={partColumns("Query")} rows={m.queries} rowKey={(p) => p.name} onRowClick={(p) => navigate(queryHref(p.name))} empty={<Empty>This endpoint ran no queries in this range.</Empty>} /></Panel>
        <Panel title={`Calls (${fmtCount(m.calls.length)})`} flush><Table columns={partColumns("Service or host")} rows={m.calls} rowKey={(p) => p.name} onRowClick={(p) => navigate(serviceHref(p.name))} empty={<Empty>This endpoint called nothing in this range.</Empty>} /></Panel>
      </div>
      <div className="wl-grid wl-grid-2-even">
        <Panel title={`Errors (${fmtCount(m.errors.length)})`} flush><Table columns={errorColumns(m.meta.window.to)} rows={m.errors} rowKey={(g) => g.key} onRowClick={(g) => navigate(errorHref(g.key))} empty={<Empty title="No exceptions">Nothing failed here in this range.</Empty>} /></Panel>
        <Panel title={m.slowest.length ? "Slowest Requests" : "Newest Requests"} flush action={viewAll}><Table columns={REQUEST_COLUMNS} rows={requests} rowKey={(r) => r.traceId} onRowClick={(r) => navigate(traceHref(r.traceId))} empty={<Empty>No request in this range.</Empty>} /></Panel>
      </div>
    </>
  );
}

/** One API endpoint on its own page: traffic, errors, and percentiles over time, its queries, calls, errors, and slowest requests. */
export function EndpointPage({ service, endpoint }: { service: string; endpoint: string }) {
  const { model: m, loading, error } = usePageModel("endpoint", { service, endpoint });
  const name = service.includes(":") ? service.slice(service.indexOf(":") + 1) : service;
  const stats: [string, string][] = m?.totals ? [["Service", name], ["Requests", fmtCount(m.totals.count)], ["Average", fmtMs(m.totals.avgMs)], ["p50", fmtMs(m.totals.p50Ms)], ["p95", fmtMs(m.totals.p95Ms)], ["p99", fmtMs(m.totals.p99Ms)]] : [["Service", name]];
  return (
    <div className="wl-dpage">
      <ModelState model={m} loading={loading} error={error} what="this endpoint" />
      <DetailHead back={[serviceHref(service), name]} icon={Waypoints} title={endpoint} mono stats={stats} />
      {m && !m.totals && <Panel><Empty title="This endpoint served nothing in this time range">Pick a longer time range at the top.</Empty></Panel>}
      {m?.totals && (
        <>
          <Cards m={m} />
          <Charts m={m} />
          <Lists m={m} />
        </>
      )}
    </div>
  );
}
