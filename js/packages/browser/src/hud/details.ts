import { type Finding, type FindingKind, insightsOf, SECURITY_LABELS, securityOf, type TraceView } from "@wizeworks/lens-core";
import { fmtMs, plural, type RequestView, share } from "../hud-model.js";
import type { PageStats } from "../page.js";
import { type Child, h } from "./dom.js";
import { dashLink, panelBar, stackBar, statusPill } from "./parts.js";
import type { HudSnapshot } from "./page-summary.js";
import { callCount, waterfall, type WfRow } from "./waterfall.js";

const FINDING_LABEL: Record<FindingKind, string> = {
  error: "Error",
  "n+1-db": "N+1 query",
  "n+1-http": "N+1 HTTP",
  "duplicate-query": "Duplicate",
  "slow-query": "Slow query",
  "db-wait": "Database wait",
  "slow-page": "Slow page",
  ...SECURITY_LABELS,
};

// Calls and insights shown. The dashboard shows them all.
const CALL_ROWS = 200;
const TOP_INSIGHTS = 3;

/** What the details panel shows: the page, its calls as rows, and findings from the traces of its flagged calls. */
export interface DetailsModel {
  snap: HudSnapshot;
  page: PageStats;
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
    const part = share(ms, view.totalMs);
    return h("span", null, h("i", { class: `wl-dot ${cls}` }), " ", h("b", null, fmtMs(ms)), ` ${label} `, part && `(${part})`);
  };
  return h("div", { class: "wl-legend" }, item("wl-c-server", view.serverMs, "Server"), item("wl-c-db", view.dbMs, "Database"), item("wl-c-render", view.renderMs, "Render"));
}

// Page load is the card's Total, so the two match. LCP is for full loads only.
function pageVitals(page: PageStats, snap: HudSnapshot): HTMLElement {
  const lcp = snap.lead ? page.lcpMs : null;
  return h(
    "dl",
    { class: "wl-stats wl-stats-sm" },
    stat("Page load", fmtMs(snap.view.totalMs), null, snap.lead ? "Navigation start to the first paint. The same as Total." : "Route change to the end of the calls that loaded it. The same as Total."),
    stat("LCP", fmtMs(lcp), grade(lcp, 2500, 4000), "Largest Contentful Paint: when the main content shows, on a full page load. Good: 2.5 s or less."),
    stat("INP", fmtMs(page.inpMs), grade(page.inpMs, 200, 500), "Interaction to Next Paint: the slowest click or key press. Good: 200 ms or less."),
    stat("CLS", page.cls === null ? "—" : page.cls.toFixed(3), grade(page.cls, 0.1, 0.25), "Cumulative Layout Shift: how much the page jumps. Good: 0.1 or less."),
  );
}

// Errors, insights, and security risks apart, so the counts match the card's. They come first: they are what to fix.
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

// Every call of the page on one time axis. New calls land at the bottom.
function calls(m: DetailsModel): Child[] {
  const { snap, rows } = m;
  const hidden = Math.max(0, rows.length - CALL_ROWS) + snap.dropped;
  return [
    h("h3", null, `Calls · ${callCount(rows) + snap.dropped}`),
    hidden > 0 && h("p", { class: "wl-muted" }, `${plural(hidden, "earlier call")} not shown.`),
    waterfall(rows.slice(-CALL_ROWS), snap.req.startMs),
  ];
}

// The page's time and split. It stays at the top while the calls scroll.
function summary({ req, view }: HudSnapshot): HTMLElement {
  const services = req.server?.services ?? [];
  return h(
    "div",
    { class: "wl-sum" },
    h("div", { class: "wl-meta" }, `${new Date(req.startMs).toLocaleTimeString()} · ${fmtMs(view.totalMs)}`, services.length > 0 ? ` · ${services.join(", ")}` : ""),
    stackBar(view, true, view.health === "critical"),
    legend(view),
  );
}

/** A short look at the page: its calls and what went wrong. Every "view all" link opens the dashboard in a new tab. */
export function details(m: DetailsModel, onClose: () => void): HTMLElement {
  const { req, view } = m.snap;
  const pill = statusPill(req, view);
  return h(
    "section",
    { key: "details", class: "wl-panel wl-details", "aria-label": "WizeLens page details" },
    panelBar(onClose, h("span", { class: "wl-panel-title", title: req.url }, `${req.method} ${req.path}`), h("span", { class: `wl-pill ${pill.cls}` }, pill.text)),
    summary(m.snap),
    h("div", { class: "wl-body" }, findingGroups(m.findings, m.link), calls(m)),
    h("div", { class: "wl-page" }, h("h3", null, "This page"), pageVitals(m.page, m.snap)),
  );
}
