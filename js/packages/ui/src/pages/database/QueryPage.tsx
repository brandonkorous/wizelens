import { Clock, Database, Gauge, TriangleAlert } from "lucide-react";
import { endpointDoc, percentChange, serviceDoc, type QueryPageModel, type QueryUse, type TraceItem } from "@wizeworks/lens-core";
import { traceRow } from "../../data/tagMatch";
import { GroupTaggedTable, TaggedTable } from "../../ui/TaggedTable";
import { usePageModel } from "../../data/models";
import { compareSeriesLabel, fmtCount, fmtMs, fmtTime } from "../../format";
import { endpointHref, hrefTo, navigate, traceHref } from "../../routes";
import { CopyButton, DotText } from "../../ui/Badges";
import { DetailHead } from "../../ui/DetailHead";
import { ModelState } from "../../ui/ModelState";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { type Column } from "../../ui/Table";
import { TimeChart } from "../../ui/TimeChart";
import { serviceHref } from "../services/serviceParts";
import "../../styles/pages/database.css";

const useColumns = (byEndpoint: boolean): Column<QueryUse>[] => [
  { key: "name", header: byEndpoint ? "Endpoint" : "Service", className: "wl-cell-wide", cell: (u) => <span className="wl-truncate">{byEndpoint ? `${u.endpoint} · ${u.service}` : u.service}</span> },
  { key: "count", header: "Count", num: true, sort: (u) => u.count, cell: (u) => fmtCount(u.count) },
  { key: "avg", header: "Avg", num: true, sort: (u) => u.avgMs ?? 0, cell: (u) => fmtMs(u.avgMs) },
];

const TRACE_COLUMNS: Column<TraceItem>[] = [
  { key: "time", header: "Time", className: "wl-nowrap", cell: (t) => fmtTime(t.startMs) },
  { key: "path", header: "Trace", className: "wl-cell-wide", cell: (t) => <span className="wl-truncate" title={t.path}>{t.path}</span> },
  { key: "status", header: "Status", cell: (t) => <DotText tone={t.status === "error" ? "danger" : "success"}>{t.status === "error" ? "Failed" : "OK"}</DotText> },
  { key: "duration", header: "Duration", num: true, cell: (t) => fmtMs(t.durationMs) },
];

function Cards({ m }: { m: QueryPageModel }) {
  const t = m.totals!;
  const change = (a: number | null, b: number | null | undefined) => (m.meta.hasPrev ? percentChange(a, b ?? 0) : null);
  const common = { compareLabel: m.meta.compareLabel, upIsGood: false };
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Gauge} label="Runs" value={fmtCount(t.count)} change={change(t.count, m.prev?.count)} series={m.chart.count} {...common} />
      <StatCard icon={Clock} label="Avg Duration" value={fmtMs(t.avgMs)} change={change(t.avgMs, m.prev?.avgMs)} series={m.chart.avgMs} {...common} />
      <StatCard icon={TriangleAlert} label={`Slow (≥ ${fmtMs(m.slowMs)})`} value={fmtCount(t.slow)} change={change(t.slow, m.prev?.slow)} series={m.chart.slow} danger {...common} />
      <StatCard icon={Clock} label="Total Time" value={fmtMs(t.totalMs)} change={change(t.totalMs, m.prev?.totalMs)} {...common} />
    </div>
  );
}

function Body({ m }: { m: QueryPageModel }) {
  const prev = { label: compareSeriesLabel(m.meta.compare), values: m.chart.prevCount, color: "var(--wl-slate)", dashed: true };
  const slowest = m.slowest ? <ViewAll href={traceHref(m.slowest.traceId, "sql")} label={`Slowest run: ${fmtMs(m.slowest.durationMs)}`} /> : null;
  return (
    <>
      <Cards m={m} />
      <div className="wl-grid wl-grid-2-even">
        <Panel title="Runs Over Time">
          <TimeChart starts={m.starts} lines={[{ label: "Runs", values: m.chart.count, color: "var(--wl-blue)" }, prev]} height={220} format={fmtCount} />
        </Panel>
        <Panel title="Duration Over Time" action={slowest}>
          <TimeChart starts={m.starts} lines={[{ label: "Avg duration", values: m.chart.avgMs, color: "var(--wl-blue)" }]} bars={[{ label: "Slow runs", values: m.chart.slow, color: "color-mix(in srgb, var(--wl-red) 45%, transparent)" }]} height={220} separateBarScale format={(v) => fmtMs(v)} />
        </Panel>
      </div>
      <div className="wl-grid wl-grid-2-even">
        <Panel title="Services" flush><GroupTaggedTable paging={{ noun: "services", key: "svc" }} group="services" docOf={(u) => serviceDoc(u.service)} tagged="name" columns={useColumns(false)} rows={m.services} rowKey={(u) => u.service} onRowClick={(u) => navigate(serviceHref(u.service))} empty={<Empty>No service ran it.</Empty>} /></Panel>
        <Panel title="Endpoints" flush><GroupTaggedTable paging={{ noun: "endpoints", key: "ep" }} group="endpoints" docOf={(u) => endpointDoc(u.service, u.endpoint)} tagged="name" columns={useColumns(true)} rows={m.endpoints} rowKey={(u) => `${u.service} ${u.endpoint}`} onRowClick={(u) => navigate(endpointHref(u.service, u.endpoint))} empty={<Empty>It ran outside requests (jobs, workers).</Empty>} /></Panel>
      </div>
      <Panel title={`Newest Traces (${fmtCount(m.traces.length)})`} flush>
        <TaggedTable paging={{ noun: "traces", key: "traces" }} kind="traces" itemOf={traceRow} tagged="path" columns={TRACE_COLUMNS} rows={m.traces} rowKey={(t) => t.traceId} onRowClick={(t) => navigate(traceHref(t.traceId, "sql"))} empty={<Empty>No trace in this range.</Empty>} />
      </Panel>
    </>
  );
}

/** One query shape on its own page: runs and time over time, the services and endpoints that run it, and its newest traces. */
export function QueryPage({ query }: { query: string }) {
  const { model: m, loading, error } = usePageModel("query", { q: query });
  const stats: [string, string][] = m?.totals ? [["Runs", fmtCount(m.totals.count)], ["Average", fmtMs(m.totals.avgMs)], ["P95", fmtMs(m.totals.p95Ms)], ["Errors", fmtCount(m.totals.errors)], ["System", m.slowest?.system ?? "–"]] : [];
  return (
    <div className="wl-dpage wl-db-page">
      <ModelState model={m} loading={loading} error={error} what="this query" />
      <DetailHead back={[hrefTo("database"), "All queries"]} icon={Database} title={query} mono actions={<CopyButton text={query} label="Copy query" />} stats={stats} />
      {m && !m.totals && <Panel><Empty title="This query did not run in this time range">Pick a longer time range at the top.</Empty></Panel>}
      {m?.totals && <Body m={m} />}
    </div>
  );
}
