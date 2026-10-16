import { Clock, Layers, Lightbulb, TriangleAlert } from "lucide-react";
import type { RequestHeadlines } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, fmtPct } from "../../format";
import { StatCard } from "../../ui/StatCard";

export interface RequestsCardsProps {
  headlines: RequestHeadlines;
  compareLabel: string;
  empty: boolean;
}

/** Totals for the filtered requests, compared with the same filter in the previous range. */
export function RequestsCards({ headlines: h, compareLabel, empty }: RequestsCardsProps) {
  return (
    <div className="wl-grid wl-rq-cards">
      <StatCard icon={Layers} label="Total Requests" value={fmtCount(h.total.value)} change={h.total.change} upIsGood compareLabel={compareLabel} series={h.total.series} />
      <StatCard icon={Clock} label="Avg Duration" value={fmtMs(h.avgDuration.value)} change={h.avgDuration.change} upIsGood={false} compareLabel={compareLabel} series={h.avgDuration.series} />
      <StatCard icon={TriangleAlert} label="Error Rate" value={empty ? "–" : fmtPct(h.errorRate.value)} change={h.errorRate.change} upIsGood={false} compareLabel={compareLabel} series={h.errorRate.series} danger />
      <StatCard icon={Lightbulb} label="Requests With Insights" value={fmtCount(h.withInsights.value)} change={h.withInsights.change} upIsGood={false} compareLabel={compareLabel} series={h.withInsights.series} />
    </div>
  );
}
