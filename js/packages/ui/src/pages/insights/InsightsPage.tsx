import { Clock, Lightbulb, TriangleAlert } from "lucide-react";
import { type InsightsModel, percentChange } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { fmtCount, fmtMs } from "../../format";
import { useServiceScope } from "../../data/prefs";
import { setQuery, useRoute } from "../../routes";
import { SearchInput, Select } from "../../ui/Controls";
import { FilterChips } from "../../ui/FilterChips";
import { ServiceSelect } from "../../ui/ServiceSelect";
import { useSearchText } from "../../ui/useSearchText";
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

/** Service, area, impact, and search live in the URL (the service in the shared scope), so a filtered view can be shared. */
function Filters() {
  const q = useRoute().query;
  const [scope] = useServiceScope();
  const [text, setText] = useSearchText(q.get("q") ?? "", {});
  return (
    <Panel className="wl-filters">
      <ServiceSelect value={q.get("service") ?? scope} />
      <Select label="Area" value={q.get("area") ?? "all"} onChange={(v) => setQuery({ area: v === "all" ? null : v })} options={[["all", "All Areas"], ["database", "Database"], ["http", "HTTP"], ["render", "Rendering"]]} />
      <Select label="Impact" value={q.get("impact") ?? "all"} onChange={(v) => setQuery({ impact: v === "all" ? null : v })} options={[["all", "All Impacts"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]]} />
      <SearchInput value={text} onChange={setText} placeholder="Search by query, endpoint, route, or component…" />
      <FilterChips chips={[["Endpoint", "endpoint", q.get("endpoint") ?? ""]]} />
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
