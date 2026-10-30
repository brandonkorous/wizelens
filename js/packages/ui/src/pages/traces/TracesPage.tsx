import { Clock, Layers, Lightbulb, TriangleAlert } from "lucide-react";
import { percentChange, type TracesModel } from "@wizeworks/lens-core/internal";
import { useData } from "../../data/hooks";
import { usePageModel } from "../../data/models";
import { fmtCount } from "../../format";
import { hrefTo } from "../../routes";
import { ModelState } from "../../ui/ModelState";
import { PageHeader } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { LayerTimeline } from "./LayerTimeline";
import { RecentTraces } from "./RecentTraces";
import { TraceFilters } from "./TraceFilters";
import { TraceAttributes } from "./TraceAttributes";
import { BottleneckPanel, CriticalSpansPanel } from "./TraceSidePanels";
import "../../styles/pages/traces.css";

function Cards({ m }: { m: TracesModel }) {
  const { cur, prev, insights, prevInsights, insightSeries } = m.cards;
  const compareLabel = m.meta.compareLabel;
  const change = (a: number | null, b: number | null) => (m.meta.hasPrev ? percentChange(a, b) : null);
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Layers} label="Selected Traces" value={fmtCount(cur.count)} change={change(cur.count, prev.count)} upIsGood compareLabel={compareLabel} series={cur.series.count} />
      <StatCard icon={Clock} label="Avg Span Count" value={cur.avgSpans === null ? "–" : cur.avgSpans.toFixed(0)} change={change(cur.avgSpans, prev.avgSpans)} upIsGood compareLabel={compareLabel} series={cur.series.avgSpans} />
      <StatCard icon={TriangleAlert} label="Slow Traces" href={hrefTo("traces", [], { duration: "slowest", sort: "duration" })} value={fmtCount(cur.slow)} change={change(cur.slow, prev.slow)} upIsGood={false} compareLabel={compareLabel} series={cur.series.slow} danger />
      <StatCard icon={Lightbulb} label="Bottleneck Insights" href={hrefTo("insights")} value={fmtCount(insights)} change={change(insights, prevInsights)} upIsGood={false} compareLabel={compareLabel} series={insightSeries} />
    </div>
  );
}

function TracesBody({ m }: { m: TracesModel }) {
  const data = useData();
  return (
    <>
      <TraceFilters filter={m.filter} />
      <Cards m={m} />
      <div className="wl-grid wl-traces-top">
        <RecentTraces items={m.recent} total={m.matching} page={m.page} size={m.size} selectedId={m.selected?.traceId ?? null} />
        <LayerTimeline trace={m.selected} />
      </div>
      <div className="wl-grid wl-grid-3">
        <BottleneckPanel data={m.bottlenecks} />
        <CriticalSpansPanel critical={m.critical} />
        <TraceAttributes trace={m.selected} sources={data.sources} />
      </div>
    </>
  );
}

export function TracesPage() {
  const { model, loading, error } = usePageModel("traces");
  return (
    <>
      <PageHeader title="Traces" subtitle="Follow requests across browser, API, database, and rendering to understand performance end-to-end." />
      <ModelState model={model} loading={loading} error={error} what="traces" />
      {model && <TracesBody m={model} />}
    </>
  );
}
