import { Clock, Database, Layers, Lightbulb, TriangleAlert } from "lucide-react";
import type { OverviewModel } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, fmtPct } from "../../format";
import { StatCard } from "../../ui/StatCard";

/** The five headline cards across the top of the overview. Insights count like the Insights page. */
export function OverviewCards({ m }: { m: OverviewModel }) {
  const h = m.headlines;
  const empty = m.empty;
  const compare = m.meta.compareLabel;
  return (
    <div className="wl-grid wl-ov-cards">
      <StatCard icon={Layers} label="Total Requests" value={fmtCount(h.total.value)} change={h.total.change} upIsGood compareLabel={compare} series={h.total.series} />
      <StatCard icon={Clock} label="Avg Duration" value={fmtMs(h.avgDuration.value)} change={h.avgDuration.change} upIsGood={false} compareLabel={compare} series={h.avgDuration.series} />
      <StatCard icon={Database} label="SQL Queries" value={fmtCount(h.sqlQueries.value)} change={h.sqlQueries.change} upIsGood={false} compareLabel={compare} series={h.sqlQueries.series} />
      <StatCard icon={TriangleAlert} label="Error Rate" value={empty ? "–" : fmtPct(h.errorRate.value)} change={h.errorRate.change} upIsGood={false} compareLabel={compare} series={h.errorRate.series} danger />
      <StatCard icon={Lightbulb} label="Insights Found" value={fmtCount(m.insightsFound.value)} change={m.insightsFound.change} upIsGood={false} compareLabel={compare} series={m.insightsFound.series} />
    </div>
  );
}
