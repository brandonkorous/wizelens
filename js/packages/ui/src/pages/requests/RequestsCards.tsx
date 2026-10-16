import { useMemo } from "react";
import { Clock, Layers, Lightbulb, TriangleAlert } from "lucide-react";
import { type RequestRow, requestHeadlines, type TimeWindow } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, fmtPct } from "../../format";
import { StatCard } from "../../ui/StatCard";

export interface RequestsCardsProps {
  rows: readonly RequestRow[];
  prevRows: readonly RequestRow[];
  window: TimeWindow;
  compareLabel: string;
}

/** Totals for the filtered requests, compared with the same filter in the previous range. */
export function RequestsCards({ rows, prevRows, window, compareLabel }: RequestsCardsProps) {
  const h = useMemo(() => requestHeadlines(rows, prevRows, window), [rows, prevRows, window]);
  return (
    <div className="wl-grid wl-rq-cards">
      <StatCard icon={Layers} label="Total Requests" value={fmtCount(h.total.value)} change={h.total.change} upIsGood compareLabel={compareLabel} series={h.total.series} />
      <StatCard icon={Clock} label="Avg Duration" value={fmtMs(h.avgDuration.value)} change={h.avgDuration.change} upIsGood={false} compareLabel={compareLabel} series={h.avgDuration.series} />
      <StatCard icon={TriangleAlert} label="Error Rate" value={rows.length ? fmtPct(h.errorRate.value) : "–"} change={h.errorRate.change} upIsGood={false} compareLabel={compareLabel} series={h.errorRate.series} danger />
      <StatCard icon={Lightbulb} label="Requests With Insights" value={fmtCount(h.withInsights.value)} change={h.withInsights.change} upIsGood={false} compareLabel={compareLabel} series={h.withInsights.series} />
    </div>
  );
}
