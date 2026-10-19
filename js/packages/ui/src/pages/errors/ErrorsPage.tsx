import { Bell, Boxes, Bug, TriangleAlert } from "lucide-react";
import { fmtCount, fmtPct } from "../../format";
import { decodeParam, hrefTo, useRoute } from "../../routes";
import { PageHeader } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { ErrorsOverTimePanel, TopErrorTypesPanel } from "./ErrorCharts";
import { ErrorDetailsPanel } from "./ErrorDetails";
import { ErrorFilters } from "./ErrorFilters";
import { ErrorGroupPage } from "./ErrorGroupPage";
import { ErrorsByServicePanel, RecentExceptionsPanel } from "./ErrorTables";
import type { ErrorsModel } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { ModelState } from "../../ui/ModelState";
import "../../styles/pages/errors.css";

function ErrorStatCards({ stats }: { stats: ErrorsModel }) {
  const { cards, change, sparks, meta } = stats;
  const common = { upIsGood: false, compareLabel: meta.compareLabel, danger: true };
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Bug} label="Total Exceptions" value={fmtCount(cards.exceptions)} change={change.exceptions} series={sparks.exceptions} {...common} />
      <StatCard icon={TriangleAlert} label="Error Rate" value={stats.hasRequests ? fmtPct(cards.errorRate) : "–"} change={change.errorRate} series={sparks.errorRate} {...common} />
      <StatCard icon={Boxes} label="Impacted Endpoints" value={fmtCount(cards.endpoints)} change={change.endpoints} {...common} danger={false} />
      <StatCard icon={Bell} label="Critical Incidents" href={hrefTo("errors", [], { critical: "1" })} value={fmtCount(cards.critical)} change={change.critical} series={sparks.critical} {...common} />
    </div>
  );
}

/** All errors, or one error group's page at `#/errors/<key>`. */
export function ErrorsPage() {
  const [id] = useRoute().params;
  return id ? <ErrorGroupPage key={id} group={decodeParam(id)} /> : <AllErrors />;
}

function AllErrors() {
  const { model, loading, error } = usePageModel("errors");
  return (
    <div className="wl-errors-page">
      <PageHeader title="Errors" subtitle="Investigate exceptions, failures, and request-level problems across your stack." />
      <ModelState model={model} loading={loading} error={error} what="errors" />
      {model && <ErrorsBody stats={model} />}
    </div>
  );
}

function ErrorsBody({ stats }: { stats: ErrorsModel }) {
  const linked = useRoute().query.get("group");
  const group = linked ? stats.selected : (stats.groups[0] ?? null);
  const selected = group?.key ?? null;
  return (
    <>
      <ErrorFilters stats={stats} />
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
        <ErrorDetailsPanel groups={stats.groups} group={group} linked={!!linked} issues={stats.issues} />
      </div>
    </>
  );
}
