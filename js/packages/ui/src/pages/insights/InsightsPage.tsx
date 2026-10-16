import { useMemo, useState } from "react";
import { Clock, Lightbulb, TriangleAlert } from "lucide-react";
import { type InsightGroup, insightGroups, percentChange, series } from "@wizeworks/lens-core";
import { useWindowed } from "../../data/hooks";
import { fmtCount, fmtMs } from "../../format";
import { useRoute } from "../../routes";
import { SearchInput, Select } from "../../ui/Controls";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { InsightDetail } from "./InsightDetail";
import { InsightList } from "./InsightList";
import "../../styles/pages/insights.css";

type AreaFilter = "all" | InsightGroup["area"];
type ImpactFilter = "all" | InsightGroup["impact"];

const BUCKETS = 24;

function matches(g: InsightGroup, area: AreaFilter, impact: ImpactFilter, q: string): boolean {
  if (area !== "all" && g.area !== area) return false;
  if (impact !== "all" && g.impact !== impact) return false;
  if (!q) return true;
  const text = `${g.title} ${g.description} ${g.shape} ${g.endpoints.join(" ")}`.toLowerCase();
  return text.includes(q.toLowerCase());
}

function Cards({ groups, prev, compareLabel, starts }: { groups: InsightGroup[]; prev: InsightGroup[]; compareLabel: string; starts: (number | null)[] }) {
  const high = groups.filter((g) => g.impact === "high").length;
  const totalMs = groups.reduce((t, g) => t + g.totalMs, 0);
  const prevMs = prev.reduce((t, g) => t + g.totalMs, 0);
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Lightbulb} label="Insights Found" value={fmtCount(groups.length)} change={percentChange(groups.length, prev.length)} upIsGood={false} compareLabel={compareLabel} series={starts} />
      <StatCard icon={TriangleAlert} danger label="High Impact" value={fmtCount(high)} change={percentChange(high, prev.filter((g) => g.impact === "high").length)} upIsGood={false} compareLabel={compareLabel} />
      <StatCard icon={Clock} label="Time Involved" value={fmtMs(totalMs)} change={percentChange(totalMs, prevMs)} upIsGood={false} compareLabel={compareLabel} />
    </div>
  );
}

export function InsightsPage() {
  const win = useWindowed();
  const key = useRoute().query.get("key");
  const [area, setArea] = useState<AreaFilter>("all");
  const [impact, setImpact] = useState<ImpactFilter>("all");
  const [q, setQ] = useState("");
  const groups = useMemo(() => insightGroups(win.traces), [win.traces]);
  const prev = useMemo(() => insightGroups(win.prevTraces), [win.prevTraces]);
  const trend = useMemo(() => series(groups, (g) => g.lastSeenMs, win.window, BUCKETS), [groups, win.window]);
  const visible = groups.filter((g) => matches(g, area, impact, q));
  const selected = key ? (groups.find((g) => g.key === key) ?? null) : null;
  return (
    <>
      <PageHeader title="Insights" subtitle="Problems WizeLens found in your requests and pages, ranked by impact." />
      <Cards groups={groups} prev={prev} compareLabel={win.compareLabel} starts={trend} />
      <Panel className="wl-filters">
        <Select label="Area" value={area} onChange={setArea} options={[["all", "All Areas"], ["database", "Database"], ["http", "HTTP"], ["render", "Rendering"]]} />
        <Select label="Impact" value={impact} onChange={setImpact} options={[["all", "All Impacts"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]]} />
        <SearchInput value={q} onChange={setQ} placeholder="Search by query, endpoint, route, or component…" />
      </Panel>
      <div className={`wl-grid${key ? " wl-grid-side" : ""}`}>
        <Panel flush title={`Insights (${fmtCount(visible.length)})`}>
          <InsightList groups={visible} selected={selected?.key ?? null} now={win.window.to} filtered={visible.length !== groups.length} />
        </Panel>
        {key && (selected ? <InsightDetail group={selected} now={win.window.to} /> : <Panel><Empty title="This insight is not in the selected time range" /></Panel>)}
      </div>
    </>
  );
}
