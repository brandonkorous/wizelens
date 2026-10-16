import { useMemo } from "react";
import { Clock, Layers, Lightbulb, TriangleAlert } from "lucide-react";
import { insightGroups, percentChange, series, traceCards } from "@wizeworks/lens-core";
import { useData, useWindowed } from "../../data/hooks";
import { fmtCount } from "../../format";
import { useRoute } from "../../routes";
import { PageHeader } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { LayerTimeline } from "./LayerTimeline";
import { RecentTraces } from "./RecentTraces";
import { TraceAttributes } from "./TraceAttributes";
import { BottleneckPanel, CriticalSpansPanel } from "./TraceSidePanels";
import "../../styles/pages/traces.css";

const BUCKETS = 24;

function useCards() {
  const win = useWindowed();
  return useMemo(() => {
    const cur = traceCards(win.traces, win.window, BUCKETS);
    const prev = traceCards(win.prevTraces, win.prev, BUCKETS);
    const insights = insightGroups(win.traces).length;
    const prevInsights = win.prevTraces.length ? insightGroups(win.prevTraces).length : null;
    const insightSeries = series(win.requests, (r) => r.startMs, win.window, BUCKETS, "sum", (r) => r.insights);
    return { win, cur, prev, insights, prevInsights, insightSeries };
  }, [win]);
}

function Cards() {
  const { win, cur, prev, insights, prevInsights, insightSeries } = useCards();
  const has = win.prevTraces.length > 0;
  const change = (a: number | null, b: number | null) => (has ? percentChange(a, b) : null);
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Layers} label="Selected Traces" value={fmtCount(cur.count)} change={change(cur.count, prev.count)} upIsGood compareLabel={win.compareLabel} series={cur.series.count} />
      <StatCard icon={Clock} label="Avg Span Count" value={cur.avgSpans === null ? "–" : cur.avgSpans.toFixed(0)} change={change(cur.avgSpans, prev.avgSpans)} upIsGood compareLabel={win.compareLabel} series={cur.series.avgSpans} />
      <StatCard icon={TriangleAlert} label="Slow Traces" value={fmtCount(cur.slow)} change={change(cur.slow, prev.slow)} upIsGood={false} compareLabel={win.compareLabel} series={cur.series.slow} danger />
      <StatCard icon={Lightbulb} label="Bottleneck Insights" value={fmtCount(insights)} change={change(insights, prevInsights)} upIsGood={false} compareLabel={win.compareLabel} series={insightSeries} />
    </div>
  );
}

export function TracesPage() {
  const win = useWindowed();
  const data = useData();
  const route = useRoute();
  const wanted = route.query.get("trace");
  const selected = (wanted && win.all.find((t) => t.traceId === wanted)) || win.traces[0] || null;
  return (
    <>
      <PageHeader title="Traces" subtitle="Follow requests across browser, API, database, and rendering to understand performance end-to-end." />
      <Cards />
      <div className="wl-grid wl-traces-top">
        <RecentTraces traces={win.traces} selectedId={selected?.traceId ?? null} />
        <LayerTimeline trace={selected} />
      </div>
      <div className="wl-grid wl-grid-3">
        <BottleneckPanel traces={win.traces} />
        <CriticalSpansPanel traces={win.traces} />
        <TraceAttributes trace={selected} sources={data.sources} />
      </div>
    </>
  );
}
