import type { ComponentRow, RouteIssue, RouteRow } from "@wizeworks/lens-core";
import { fmtCount, fmtMs } from "../../format";
import { hrefTo, navigate, traceHref } from "../../routes";
import { CountBadge, DotText, ImpactBadge, type Tone } from "../../ui/Badges";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

const PREVIEW = 6;

const ISSUE: Record<RouteIssue, { tone: Tone; label: string }> = {
  none: { tone: "success", label: "None" },
  minor: { tone: "warning", label: "Minor" },
  high: { tone: "danger", label: "High" },
};

// Render time counts route changes too; the load parts come from full page loads only, so they can be larger.
const LOADS_ONLY = "Full page loads only";
const hint = (text: string, title: string) => <span title={title}>{text}</span>;

const ROUTE_COLUMNS: Column<RouteRow>[] = [
  { key: "route", header: "Route", cell: (r) => <span className="wl-mono">{r.route}</span>, sort: (r) => r.route },
  { key: "views", header: "Page Views", num: true, cell: (r) => fmtCount(r.views), sort: (r) => r.views },
  { key: "render", header: hint("Avg. Render Time", "Full page loads and in-app route changes"), num: true, cell: (r) => fmtMs(r.avgRenderMs), sort: (r) => r.avgRenderMs ?? -1 },
  { key: "ssr", header: hint("SSR Time", LOADS_ONLY), num: true, cell: (r) => fmtMs(r.avgSsrMs), sort: (r) => r.avgSsrMs ?? -1 },
  { key: "hydration", header: hint("Hydration Time", LOADS_ONLY), num: true, cell: (r) => fmtMs(r.avgHydrationMs), sort: (r) => r.avgHydrationMs ?? -1 },
  { key: "cls", header: "Layout Shift", num: true, cell: (r) => (r.avgCls === null ? "–" : r.avgCls.toFixed(2)), sort: (r) => r.avgCls ?? -1 },
  {
    key: "issue",
    header: "Issues",
    cell: (r) => (
      <span title={r.issues.join("\n") || undefined}>
        <DotText tone={ISSUE[r.issue].tone} colorText={r.issue === "high"}>{ISSUE[r.issue].label}</DotText>
      </span>
    ),
    sort: (r) => r.issues.length,
  },
  { key: "count", header: <span className="wl-sr-only">Issue count</span>, num: true, cell: (r) => <CountBadge n={r.issues.length} /> },
];

const COMPONENT_COLUMNS: Column<ComponentRow>[] = [
  { key: "name", header: "Component", cell: (c) => <span className="wl-mono">{c.name}</span>, sort: (c) => c.name },
  { key: "renders", header: "Render Count", num: true, cell: (c) => fmtCount(c.renders), sort: (c) => c.renders },
  { key: "avg", header: "Avg. Render Time", num: true, cell: (c) => fmtMs(c.avgMs), sort: (c) => c.avgMs },
  { key: "self", header: "Self Time", num: true, cell: (c) => fmtMs(c.selfMs), sort: (c) => c.selfMs },
  { key: "total", header: "Total Time", num: true, cell: (c) => fmtMs(c.totalMs), sort: (c) => c.totalMs },
  { key: "impact", header: "Impact", cell: (c) => <ImpactBadge impact={c.impact} />, sort: (c) => ({ high: 3, medium: 2, low: 1 })[c.impact] },
  { key: "issues", header: "Issues", cell: (c) => <span title={c.issues.join("\n") || undefined}>{c.issues[0] ?? "–"}</span>, sort: (c) => c.issues.length },
  { key: "count", header: <span className="wl-sr-only">Issue count</span>, num: true, cell: (c) => <CountBadge n={c.issues.length} /> },
];

function more(all: boolean, what: "routes" | "components", total: number, label: string) {
  if (total <= PREVIEW) return null;
  return all ? <ViewAll href={hrefTo("rendering")} label="Show fewer" /> : <ViewAll href={hrefTo("rendering", [], { all: what })} label={label} />;
}

export function RouteTable({ routes, all }: { routes: RouteRow[]; all: boolean }) {
  return (
    <Panel flush title="Pages & Routes" action={more(all, "routes", routes.length, "View all pages")}>
      <Table
        columns={ROUTE_COLUMNS}
        rows={all ? routes : routes.slice(0, PREVIEW)}
        rowKey={(r) => r.route}
        onRowClick={(r) => navigate(traceHref(r.exampleTraceId))}
        empty={<Empty title="No page views in this range" />}
      />
    </Panel>
  );
}

export function ComponentTable({ components, hasReact, all }: { components: ComponentRow[]; hasReact: boolean; all: boolean }) {
  const empty = hasReact ? (
    <Empty title="No component renders in this range" />
  ) : (
    <Empty title="No React render data">
      Add <code className="wl-mono">import "@wizeworks/lens-react/install";</code> as the first line of main.tsx. Component timings work in React development builds.
    </Empty>
  );
  return (
    <Panel flush title="Component Hotspots" action={more(all, "components", components.length, "View all components")}>
      <Table
        columns={COMPONENT_COLUMNS}
        rows={all ? components : components.slice(0, PREVIEW)}
        rowKey={(c) => c.name}
        onRowClick={(c) => navigate(traceHref(c.exampleTraceId))}
        empty={empty}
      />
    </Panel>
  );
}
