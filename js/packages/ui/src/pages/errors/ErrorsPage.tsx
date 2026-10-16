import { Bell, Boxes, Gauge, TriangleAlert } from "lucide-react";
import { fmtCount, fmtPct } from "../../format";
import { useRoute } from "../../routes";
import { PageHeader } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { ErrorsOverTimePanel, TopErrorTypesPanel } from "./ErrorCharts";
import { ErrorDetailsPanel } from "./ErrorDetails";
import { ErrorsByServicePanel, RecentExceptionsPanel } from "./ErrorTables";
import { type ErrorStats, useErrorStats } from "./useErrorStats";
import "../../styles/pages/errors.css";

function ErrorStatCards({ stats }: { stats: ErrorStats }) {
  const { cards, change, sparks, w } = stats;
  const common = { upIsGood: false, compareLabel: w.compareLabel, danger: true };
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={TriangleAlert} label="Total Exceptions" value={fmtCount(cards.exceptions)} change={change.exceptions} series={sparks.exceptions} {...common} />
      <StatCard icon={Gauge} label="Error Rate" value={w.requests.length ? fmtPct(cards.errorRate) : "–"} change={change.errorRate} series={sparks.errorRate} {...common} />
      <StatCard icon={Boxes} label="Impacted Endpoints" value={fmtCount(cards.endpoints)} change={change.endpoints} {...common} danger={false} />
      <StatCard icon={Bell} label="Critical Incidents" value={fmtCount(cards.critical)} change={change.critical} series={sparks.critical} {...common} />
    </div>
  );
}

export function ErrorsPage() {
  const stats = useErrorStats();
  const selected = useRoute().query.get("group") ?? stats.groups[0]?.key ?? null;
  return (
    <div className="wl-errors-page">
      <PageHeader title="Errors" subtitle="Investigate exceptions, failures, and request-level problems across your stack." />
      <ErrorStatCards stats={stats} />
      <div className="wl-grid wl-grid-2">
        <ErrorsOverTimePanel stats={stats} />
        <TopErrorTypesPanel stats={stats} />
      </div>
      <div className="wl-grid wl-errors-bottom">
        <div className="wl-errors-left">
          <RecentExceptionsPanel stats={stats} selected={selected} />
          <ErrorsByServicePanel stats={stats} />
        </div>
        <ErrorDetailsPanel groups={stats.groups} selected={selected} />
      </div>
    </div>
  );
}
