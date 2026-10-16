import { Clock, Lightbulb, TriangleAlert } from "lucide-react";
import { type InsightsModel, percentChange } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { fmtCount, fmtMs } from "../../format";
import { setQuery, useRoute } from "../../routes";
import { SearchInput, Select } from "../../ui/Controls";
import { ModelState } from "../../ui/ModelState";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { InsightDetail } from "./InsightDetail";
import { InsightList } from "./InsightList";
import "../../styles/pages/insights.css";

function Cards({ m }: { m: InsightsModel }) {
  const { totals: cur, prevTotals: prev } = m;
  const compareLabel = m.meta.compareLabel;
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Lightbulb} label="Insights Found" value={fmtCount(m.found.value)} change={m.found.change} upIsGood={false} compareLabel={compareLabel} series={m.found.series} />
      <StatCard icon={TriangleAlert} danger label="High Impact" value={fmtCount(cur.high)} change={percentChange(cur.high, prev.high)} upIsGood={false} compareLabel={compareLabel} />
      <StatCard icon={Clock} label="Time Involved" value={fmtMs(cur.totalMs)} change={percentChange(cur.totalMs, prev.totalMs)} upIsGood={false} compareLabel={compareLabel} />
    </div>
  );
}

/** Area, impact, and search live in the URL, so a filtered view can be shared. */
function Filters() {
  const q = useRoute().query;
  return (
    <Panel className="wl-filters">
      <Select label="Area" value={q.get("area") ?? "all"} onChange={(v) => setQuery({ area: v === "all" ? null : v })} options={[["all", "All Areas"], ["database", "Database"], ["http", "HTTP"], ["render", "Rendering"]]} />
      <Select label="Impact" value={q.get("impact") ?? "all"} onChange={(v) => setQuery({ impact: v === "all" ? null : v })} options={[["all", "All Impacts"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]]} />
      <SearchInput value={q.get("q") ?? ""} onChange={(v) => setQuery({ q: v })} placeholder="Search by query, endpoint, route, or component…" />
    </Panel>
  );
}

function InsightsBody({ m, wanted }: { m: InsightsModel; wanted: string | null }) {
  const now = m.meta.window.to;
  return (
    <>
      <Cards m={m} />
      <Filters />
      <div className={`wl-grid${wanted ? " wl-grid-side" : ""}`}>
        <Panel flush title={`Insights (${fmtCount(m.matching)})`}>
          <InsightList groups={m.groups} selected={m.selected?.key ?? null} now={now} filtered={m.matching !== m.totals.count} />
        </Panel>
        {wanted && (m.selected ? <InsightDetail group={m.selected} now={now} /> : <Panel><Empty title="This insight is not in the selected time range" /></Panel>)}
      </div>
    </>
  );
}

export function InsightsPage() {
  const key = useRoute().query.get("key");
  const { model, loading, error } = usePageModel("insights");
  return (
    <>
      <PageHeader title="Insights" subtitle="Problems WizeLens found in your requests and pages, ranked by impact." />
      <ModelState model={model} loading={loading} error={error} what="insights" />
      {model && <InsightsBody m={model} wanted={key} />}
    </>
  );
}
