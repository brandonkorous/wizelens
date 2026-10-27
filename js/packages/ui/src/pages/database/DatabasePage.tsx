import { Clock, Database, Lightbulb, TriangleAlert } from "lucide-react";
import { fmtCount, fmtMs } from "../../format";
import { PageHeader } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { OperationsPanel, SlowQueriesPanel } from "./DbCharts";
import { DbFilters } from "./DbFilters";
import { QueryPage } from "./QueryPage";
import { checksHref, decodeParam, hrefTo, useRoute } from "../../routes";
import { useData } from "../../data/hooks";
import { TableHotspotsPanel, TopQueriesPanel } from "./DbTables";
import { InsightCards } from "./InsightCards";
import type { DatabaseModel } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { ModelState } from "../../ui/ModelState";
import "../../styles/pages/database.css";

function DbStatCards({ stats }: { stats: DatabaseModel }) {
  const { summary, change, sparks, insights, meta } = stats;
  const compareLabel = meta.compareLabel;
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Database} label="SQL Queries" value={fmtCount(summary.queries)} change={change.queries} upIsGood={false} compareLabel={compareLabel} series={sparks.queries} />
      <StatCard icon={Clock} label="Avg Query Duration" value={fmtMs(summary.avgMs)} change={change.avgMs} upIsGood={false} compareLabel={compareLabel} series={sparks.avgMs} />
      <StatCard icon={TriangleAlert} label="Slow Queries" value={fmtCount(summary.slow)} change={change.slow} upIsGood={false} compareLabel={compareLabel} series={sparks.slow} danger />
      <StatCard icon={Lightbulb} label="Potential Improvements" href={hrefTo("insights", [], { area: "database" })} value={fmtCount(insights.length)} change={change.insights} upIsGood={false} compareLabel={compareLabel} />
    </div>
  );
}

/** The slow query limit in effect, and where to change it. */
function SlowLimit({ slowMs }: { slowMs: number }) {
  const mode = useData().info?.mode;
  return (
    <span className="wl-muted">
      Slow means ≥ {fmtMs(slowMs)} · <a href={checksHref(mode)}>Change</a>
    </span>
  );
}

/** All queries, or one query's page at `#/database/queries/<query>`. */
export function DatabasePage() {
  const [part, query] = useRoute().params;
  return part === "queries" && query ? <QueryPage key={query} query={decodeParam(query)} /> : <AllQueries />;
}

export function AllQueries() {
  const { model: stats, loading, error } = usePageModel("database");
  return (
    <div className="wl-db-page">
      <PageHeader title="Database" subtitle="SQL visibility, query performance, and optimization opportunities across your stack.">
        {stats && <SlowLimit slowMs={stats.slowMs} />}
      </PageHeader>
      <ModelState model={stats} loading={loading} error={error} what="queries" />
      {stats && <DatabaseBody stats={stats} />}
    </div>
  );
}

function DatabaseBody({ stats }: { stats: DatabaseModel }) {
  return (
    <>
      <DbFilters stats={stats} />
      <DbStatCards stats={stats} />
      <div className="wl-grid wl-grid-2">
        <SlowQueriesPanel stats={stats} />
        <OperationsPanel stats={stats} />
      </div>
      <div className="wl-grid">
        <TopQueriesPanel stats={stats} />
      </div>
      <div className="wl-grid">
        <TableHotspotsPanel stats={stats} />
      </div>
      <InsightCards insights={stats.insights} area="database" />
    </>
  );
}
