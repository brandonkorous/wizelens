import { Eye, Gauge, Monitor, Server, Zap } from "lucide-react";
import { percentChange, type RoutePageModel, type TraceItem } from "@wizeworks/lens-core/internal";
import { usePageModel } from "../../data/models";
import { compareSeriesLabel, fmtCount, fmtMs, fmtTime } from "../../format";
import { hrefTo, navigate, traceHref } from "../../routes";
import { BarList } from "../../ui/BarList";
import { DetailHead } from "../../ui/DetailHead";
import { ModelState } from "../../ui/ModelState";
import { Empty, Panel } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { type Column } from "../../ui/Table";
import { TaggedTable } from "../../ui/TaggedTable";
import { traceRow } from "../../data/tagMatch";
import { TimeChart } from "../../ui/TimeChart";
import { RouteDevices } from "./RouteDevices";
import "../../styles/pages/rendering.css";

const LOAD_COLUMNS: Column<TraceItem>[] = [
  { key: "time", header: "Time", className: "wl-nowrap", cell: (t) => fmtTime(t.startMs) },
  { key: "path", header: "Page", className: "wl-cell-wide", cell: (t) => <span className="wl-truncate" title={t.path}>{t.path}</span> },
  { key: "spans", header: "Spans", num: true, cell: (t) => fmtCount(t.spanCount) },
  { key: "duration", header: "Duration", num: true, cell: (t) => fmtMs(t.durationMs) },
];

function Cards({ m }: { m: RoutePageModel }) {
  const a = m.averages;
  const common = { compareLabel: m.meta.compareLabel, change: null, upIsGood: false };
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Eye} label="Page Views" value={fmtCount(m.views)} {...common} change={m.meta.hasPrev ? percentChange(m.views, m.prevViews) : null} upIsGood series={m.chart.views} />
      <StatCard icon={Gauge} label="Avg Render Time" value={fmtMs(a.render)} {...common} series={m.chart.render} />
      <StatCard icon={Zap} label="Avg LCP" value={fmtMs(a.lcp)} {...common} series={m.chart.lcp} />
      <StatCard icon={Server} label="Avg Server Response" value={fmtMs(a.ssr)} {...common} series={m.chart.ssr} />
    </div>
  );
}

function Charts({ m }: { m: RoutePageModel }) {
  const vitals = [
    { label: "Render", values: m.chart.render, color: "var(--wl-blue)" },
    { label: "LCP", values: m.chart.lcp, color: "var(--wl-orange)" },
    { label: "Hydration", values: m.chart.hydration, color: "var(--wl-k-render)" },
  ];
  return (
    <div className="wl-grid wl-grid-2-even">
      <Panel title="Page Views Over Time">
        <TimeChart starts={m.starts} lines={[{ label: "Views", values: m.chart.views, color: "var(--wl-blue)" }, { label: compareSeriesLabel(m.meta.compare), values: m.chart.prevViews, color: "var(--wl-slate)", dashed: true }]} height={220} format={fmtCount} />
      </Panel>
      <Panel title="Load Times Over Time">
        <TimeChart starts={m.starts} lines={vitals} height={220} format={(v) => fmtMs(v)} />
      </Panel>
    </div>
  );
}

function Body({ m }: { m: RoutePageModel }) {
  const top = m.components[0]?.count ?? 0;
  const components = m.components.slice(0, 12).map((c) => ({ key: c.name, label: <span className="wl-mono">{c.name}</span>, value: c.count, display: fmtCount(c.count), color: c.count === top ? "var(--wl-blue)" : "color-mix(in srgb, var(--wl-blue) 55%, transparent)" }));
  return (
    <>
      <RouteDevices devices={m.devices} />
      <Cards m={m} />
      <Charts m={m} />
      <div className="wl-grid wl-grid-2-even">
        <Panel title={`Components (${fmtCount(m.components.length)})`}>{components.length ? <BarList items={components} /> : <Empty>No React render data for this route.</Empty>}</Panel>
        <Panel title={`Newest Page Loads (${fmtCount(m.loads.length)})`} flush>
          <TaggedTable paging={{ noun: "loads", key: "loads" }} kind="traces" itemOf={traceRow} tagged="path" columns={LOAD_COLUMNS} rows={m.loads} rowKey={(t) => t.traceId} onRowClick={(t) => navigate(traceHref(t.traceId))} empty={<Empty>No page load in this range.</Empty>} />
        </Panel>
      </div>
    </>
  );
}

/** One page route on its own page: views and load times over time, the components it renders, and its newest page loads. */
export function RoutePage({ route }: { route: string }) {
  const { model: m, loading, error } = usePageModel("route", { route });
  const layout = m?.averages.cls;
  const stats: [string, string][] = m && m.views ? [["Page views", fmtCount(m.views)], ["Hydration", m.averages.hydration == null ? "None: no UI framework seen" : fmtMs(m.averages.hydration)], ["Layout shift", layout === null || layout === undefined ? "–" : layout.toFixed(2)]] : [];
  return (
    <div className="wl-dpage">
      <ModelState model={m} loading={loading} error={error} what="this route" />
      <DetailHead back={[hrefTo("rendering"), "All routes"]} icon={Monitor} title={route} mono stats={stats} />
      {m && !m.views && <Panel><Empty title="No page views of this route in this time range">Pick a longer time range at the top.</Empty></Panel>}
      {m && m.views > 0 && <Body m={m} />}
    </div>
  );
}
