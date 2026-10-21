import { type Finding, type FindingKind, insightsOf, SECURITY_LABELS, securityOf, type Trace, type TraceView, traceTiming } from "@wizeworks/lens-core";
import { fmtMs, pct, type RequestView } from "../hud-model.js";
import type { PageStats } from "../page.js";
import type { RecordedRequest } from "../recorder-types.js";
import { type Child, h } from "./dom.js";
import { dashLink, noServerData, panelBar, stackBar, statusPill } from "./parts.js";
import { waterfall, type WfRow } from "./waterfall.js";

const FINDING_LABEL: Record<FindingKind, string> = {
  error: "Error",
  "n+1-db": "N+1 query",
  "n+1-http": "N+1 HTTP",
  "duplicate-query": "Duplicate",
  "slow-query": "Slow query",
  "db-wait": "Database wait",
  ...SECURITY_LABELS,
};

// Rows of the short timeline and insights shown. The dashboard shows them all.
const TIMELINE_ROWS = 6;
const TOP_INSIGHTS = 3;

/** What the details panel shows. `findings` and `rows` come from the loaded trace. */
export interface DetailsModel {
  req: RecordedRequest | null;
  view: RequestView;
  page: PageStats;
  trace: Trace | null;
  findings: Finding[];
  rows: WfRow[];
  link: (view: TraceView) => string;
}

const grade = (v: number | null, good: number, poor: number) => (v === null ? null : v <= good ? "wl-good" : v <= poor ? "wl-fair" : "wl-poor");

function stat(label: string, value: string, cls: string | null = null, title: string | null = null): HTMLElement {
  return h("div", { class: "wl-stat", title }, h("dt", null, label), h("dd", { class: cls }, value));
}

function findingList(findings: Finding[]): HTMLElement {
  const item = (f: Finding) =>
    h(
      "div",
      { class: `wl-finding wl-f-${f.severity}` },
      h("span", { class: `wl-badge wl-b-${f.severity}` }, FINDING_LABEL[f.kind]),
      h("strong", null, f.title),
      h("span", { class: "wl-muted" }, fmtMs(f.totalMs)),
      h("code", { class: "wl-mono" }, f.shape),
    );
  return h("div", null, findings.map(item));
}

function legend(view: RequestView): HTMLElement {
  const item = (cls: string, ms: number | null, label: string) => {
    const share = pct(ms, view.totalMs);
    return h("span", null, h("i", { class: `wl-dot ${cls}` }), " ", h("b", null, fmtMs(ms)), ` ${label} `, share && `(${share})`);
  };
  return h("div", { class: "wl-legend" }, item("wl-c-server", view.serverMs, "Server"), item("wl-c-db", view.dbMs, "Database"), item("wl-c-render", view.renderMs, "Render"));
}

function pageVitals(page: PageStats): HTMLElement {
  return h(
    "dl",
    { class: "wl-stats wl-stats-sm" },
    stat("Page load", fmtMs(page.totalMs)),
    stat("LCP", fmtMs(page.lcpMs), grade(page.lcpMs, 2500, 4000), "Largest Contentful Paint: when the main content shows. Good: 2.5 s or less."),
    stat("INP", fmtMs(page.inpMs), grade(page.inpMs, 200, 500), "Interaction to Next Paint: the slowest click or key press. Good: 200 ms or less."),
    stat("CLS", page.cls === null ? "—" : page.cls.toFixed(3), grade(page.cls, 0.1, 0.25), "Cumulative Layout Shift: how much the page jumps. Good: 0.1 or less."),
  );
}

// Errors, insights, and security risks apart, so the counts match the card's.
function findingGroups(findings: Finding[], link: (v: TraceView) => string): Child[] {
  const groups: [string, TraceView, Finding[]][] = [
    ["Errors", "errors", findings.filter((f) => f.kind === "error")],
    ["Insights", "insights", insightsOf(findings)],
    ["Security risks", "security", securityOf(findings)],
  ];
  return groups.map(([title, view, list]) => {
    if (list.length === 0) return null;
    const more = list.length > TOP_INSIGHTS ? `View all ${list.length} ${title.toLowerCase()}` : `View ${title.toLowerCase()}`;
    return h("div", null, h("h3", null, `${title} · ${list.length}`), findingList(list.slice(0, TOP_INSIGHTS)), dashLink(link(view), more));
  });
}

function requestBody(m: DetailsModel, req: RecordedRequest): Child[] {
  const { view, trace, rows, link } = m;
  const service = trace ? traceTiming(trace).service : req.server?.services[0];
  const all = rows.length > TIMELINE_ROWS ? `View all ${rows.length} rows` : "View the full timeline";
  return [
    h("div", { class: "wl-meta" }, `${new Date(req.startMs).toLocaleTimeString()} · ${fmtMs(view.totalMs)}`, service ? ` · ${service}` : ""),
    stackBar(view, true, view.health === "critical"),
    legend(view),
    h("h3", null, "Timeline"),
    req.profiled && !trace ? noServerData(req) : waterfall(rows, req.startMs, TIMELINE_ROWS),
    req.profiled && dashLink(link("timeline"), all),
    findingGroups(m.findings, link),
  ];
}

/** A short look at one request. Every "view all" link opens the dashboard in a new tab. */
export function details(m: DetailsModel, onClose: () => void): HTMLElement {
  const { req, view } = m;
  const pill = statusPill(req, view);
  return h(
    "section",
    { key: "details", class: "wl-panel wl-details", "aria-label": "WizeLens request details" },
    panelBar(onClose, h("span", { class: "wl-panel-title", title: req?.url }, req ? `${req.method} ${req.path}` : "Request details"), req && h("span", { class: `wl-pill ${pill.cls}` }, pill.text)),
    h("div", { class: "wl-body" }, req ? requestBody(m, req) : noServerData(null), h("h3", null, "This page"), pageVitals(m.page)),
  );
}
