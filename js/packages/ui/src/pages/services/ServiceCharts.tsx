import { Clock, Gauge, Timer, TriangleAlert } from "lucide-react";
import { percentChange, type ServiceKind, type ServicePageModel, type ServiceRow } from "@wizeworks/lens-core/internal";
import { compareSeriesLabel, fmtCount, fmtMs, fmtPct } from "../../format";
import { Panel } from "../../ui/Panel";
import { ApdexCard } from "../../ui/ApdexCard";
import { StatCard } from "../../ui/StatCard";
import { StreamsCard } from "../../ui/StreamsCard";
import type { ChartOutage } from "../../ui/OutageBands";
import { TimeChart } from "../../ui/TimeChart";
import { blankInGaps } from "./useSendGaps";

/** What a service row counts, by kind. */
export const COUNT_LABEL: Record<ServiceKind, string> = { api: "Requests", web: "Requests", worker: "Messages Handled", queue: "Messages Sent", database: "Queries", external: "Calls" };

const ERROR_BARS = "color-mix(in srgb, var(--wl-red) 45%, transparent)";

/** Count, error rate, and latency, each against the window before. */
export function ServiceCards({ m, row }: { m: ServicePageModel; row: ServiceRow }) {
  const prev = m.prevRow;
  const compareLabel = m.meta.compareLabel;
  const change = (a: number | null, b: number | null | undefined) => (m.meta.hasPrev ? percentChange(a, b ?? 0) : null);
  const rate = m.chart.requests.map((n, i) => (n ? ((m.chart.errors[i] ?? 0) / n) * 100 : null));
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Gauge} label={COUNT_LABEL[row.kind]} value={fmtCount(row.requests)} change={change(row.requests, prev?.requests)} upIsGood compareLabel={compareLabel} series={m.chart.requests} />
      <StatCard icon={TriangleAlert} label="Error Rate" value={fmtPct(row.errorRate)} change={change(row.errorRate, prev?.errorRate)} upIsGood={false} compareLabel={compareLabel} series={rate} danger />
      <StatCard icon={Clock} label="Avg Latency" value={fmtMs(row.avgMs)} change={change(row.avgMs, prev?.avgMs)} upIsGood={false} compareLabel={compareLabel} series={m.chart.avgMs} />
      <StatCard icon={Timer} label="p95 Latency" value={fmtMs(row.p95Ms)} change={change(row.p95Ms, prev?.p95Ms)} upIsGood={false} compareLabel={compareLabel} series={m.chart.p95Ms} />
      {m.owned && <ApdexCard apdex={m.apdex} compareLabel={compareLabel} />}
      <StreamsCard streams={m.streams} compareLabel={compareLabel} />
    </div>
  );
}

/** Traffic as a line, failures as bars. */
export function TrafficPanel({ m, row, gaps }: { m: ServicePageModel; row: ServiceRow; gaps: ChartOutage[] }) {
  const label = COUNT_LABEL[row.kind];
  const blank = (v: (number | null)[]) => blankInGaps(v, m.starts, gaps);
  return (
    <Panel title={`${label} Over Time`}>
      <TimeChart
        starts={m.starts}
        lines={[{ label, values: blank(m.chart.requests), color: "var(--wl-blue)" }, { label: compareSeriesLabel(m.meta.compare), values: m.chart.prevRequests, color: "var(--wl-slate)", dashed: true }]}
        bars={[{ label: "Errors", values: blank(m.chart.errors), color: ERROR_BARS }]}
        height={220}
        separateBarScale
        format={fmtCount}
        outages={gaps}
      />
      {gaps.length > 0 && <p className="wl-muted wl-small">Red bands: {row.name} sent nothing, not even a heartbeat (it stopped, or its key was refused). Its {label.toLowerCase()} there are unknown, not zero.</p>}
    </Panel>
  );
}

/** Average and p95 latency per bucket. */
export function LatencyPanel({ m, gaps }: { m: ServicePageModel; gaps: ChartOutage[] }) {
  const lines = [
    { label: "p95", values: m.chart.p95Ms, color: "var(--wl-orange)" },
    { label: "Average", values: m.chart.avgMs, color: "var(--wl-blue)" },
  ];
  return (
    <Panel title="Latency Over Time">
      <TimeChart starts={m.starts} lines={lines} height={220} format={(v) => fmtMs(v)} outages={gaps} />
    </Panel>
  );
}
