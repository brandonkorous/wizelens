import { Clock, Database, Lightbulb, TriangleAlert } from "lucide-react";
import { fmtCount, fmtMs } from "../../format";
import { PageHeader } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { OperationsPanel, SlowQueriesPanel } from "./DbCharts";
import { TableHotspotsPanel, TopQueriesPanel } from "./DbTables";
import { InsightCards } from "./InsightCards";
import { type DatabaseStats, useDatabaseStats } from "./useDatabaseStats";
import "../../styles/pages/database.css";

function DbStatCards({ stats }: { stats: DatabaseStats }) {
  const { summary, change, sparks, insights, w } = stats;
  const compareLabel = w.compareLabel;
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Database} label="SQL Queries" value={fmtCount(summary.queries)} change={change.queries} upIsGood={false} compareLabel={compareLabel} series={sparks.queries} />
      <StatCard icon={Clock} label="Avg Query Duration" value={fmtMs(summary.avgMs)} change={change.avgMs} upIsGood={false} compareLabel={compareLabel} series={sparks.avgMs} />
      <StatCard icon={TriangleAlert} label="Slow Queries" value={fmtCount(summary.slow)} change={change.slow} upIsGood={false} compareLabel={compareLabel} series={sparks.slow} danger />
      <StatCard icon={Lightbulb} label="Potential Improvements" value={fmtCount(insights.length)} change={change.insights} upIsGood={false} compareLabel={compareLabel} />
    </div>
  );
}

export function DatabasePage() {
  const stats = useDatabaseStats();
  return (
    <div className="wl-db-page">
      <PageHeader title="Database" subtitle="SQL visibility, query performance, and optimization opportunities across your stack." />
      <DbStatCards stats={stats} />
      <div className="wl-grid wl-grid-2">
        <SlowQueriesPanel stats={stats} />
        <OperationsPanel stats={stats} />
      </div>
      <div className="wl-grid wl-grid-2-even">
        <TopQueriesPanel stats={stats} />
        <TableHotspotsPanel stats={stats} />
      </div>
      <InsightCards insights={stats.insights} area="database" />
    </div>
  );
}
