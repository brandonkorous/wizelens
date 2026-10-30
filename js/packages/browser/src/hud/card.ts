import type { TraceView } from "@wizeworks/lens-core/internal";
import { fmtMs, plural, type RequestView } from "../hud-model.js";
import type { RecordedRequest } from "../recorder-types.js";
import { type Child, h } from "./dom.js";
import { iconChevron, iconGear, iconMinimize, iconPause, iconPlay } from "./icons.js";
import { stackBar, statusPill } from "./parts.js";
import type { Panel } from "./storage.js";
import { dbTip, renderTip, serverTip, totalTip } from "./tips.js";

export interface CardModel {
  req: RecordedRequest | null;
  /** How many calls the page made, and whether it is a route change. */
  page: { calls: number; navigation: "load" | "spa" } | null;
  view: RequestView;
  busy: boolean;
  live: boolean;
  panel: Panel | "";
  /** Dashboard link for one part of this request's trace. Null when the server has no trace for it. */
  link: (view?: TraceView) => string | null;
}

/** Card buttons. They read the HUD's state when clicked, so the morph can keep the first listeners. */
export interface CardActions {
  details(): void;
  toggle(p: Panel): void;
  toggleLive(): void;
  minimize(): void;
}

/** A footer count. It opens that part of the trace in the dashboard, in a new tab. */
function count(href: string | null, title: string, ...children: Child[]): HTMLElement {
  if (!href) return h("span", { class: "wl-count", title }, children);
  return h("a", { class: "wl-count", href, target: "_blank", rel: "noreferrer", title: `${title}. Opens the dashboard in a new tab.` }, children);
}

// A value with no number: "Not traced" when no WizeLens server saw the page (a static site), else a dash while it loads.
const noValue = (untraced: boolean) => (untraced ? h("span", { class: "wl-val wl-val-none" }, "Not traced") : h("span", { class: "wl-val" }, "—"));

function metric(id: string, label: string, value: number | null, valueClass: string, tip: Child[] | null, onClick: () => void, untraced = false): HTMLElement {
  const tipId = `wl-tip-${id}`;
  const button = h(
    "button",
    { type: "button", class: "wl-metric", onClick, "aria-describedby": tip ? tipId : null },
    value === null ? noValue(untraced) : h("span", { class: `wl-val ${valueClass}` }, fmtMs(value)),
    h("span", { class: "wl-lbl" }, label),
  );
  return h("div", { class: "wl-cell" }, button, tip && h("div", { class: "wl-tip", id: tipId, role: "tooltip" }, h("div", { class: "wl-tip-body" }, tip)));
}

function cardHead(m: CardModel, a: CardActions): HTMLElement {
  const open = m.panel === "details";
  const pill = statusPill(m.req, m.view);
  const chev = { type: "button", class: `wl-iconbtn wl-chev${open ? " wl-open" : ""}`, "aria-expanded": String(open) };
  return h(
    "div",
    { class: "wl-head" },
    h("span", { class: `wl-dot${m.busy ? " wl-busy" : ""}`, title: `Health: ${m.view.health}` }),
    h("span", { class: "wl-brand" }, "WizeLens"),
    h("span", { class: "wl-req", title: m.req?.url }, m.req ? `${m.req.method} ${m.req.path}` : "—"),
    h("span", { class: `wl-pill ${pill.cls}` }, pill.text),
    h("button", { ...chev, onClick: () => a.toggle("details"), title: open ? "Hide the details" : "Show the details" }, iconChevron()),
  );
}

// What the tips say the numbers cover.
function scopes(page: CardModel["page"]) {
  if (!page) return { total: undefined, sum: null };
  const total = page.navigation === "load" ? "Page start to the first paint" : "Route change to the end of the calls that loaded it";
  return { total, sum: page.calls > 0 ? `The page and its ${plural(page.calls, "call")}, added up` : null };
}

function cardMetrics({ req, view, link, page }: CardModel, a: CardActions): HTMLElement {
  const details = () => a.details();
  const scope = scopes(page);
  const untraced = !!req && !req.profiled && !req.server;
  return h(
    "div",
    { class: "wl-metrics" },
    metric("total", "Total", view.totalMs, "", req && totalTip(view, link("timeline"), scope.total), details),
    metric("server", "Server", view.serverMs, "", req && serverTip(req, view, link("http"), scope.sum), details, untraced),
    metric("db", "Database", view.dbMs, "wl-v-db", req && dbTip(req, view, link("sql"), scope.sum), details, untraced),
    metric("render", "Render", view.renderMs, "", req && renderTip(view, link("timeline")), details),
  );
}

function issueLabel({ req, view }: CardModel): Child[] {
  if (!req) return ["No Data"];
  if (view.errors > 0) return [plural(view.errors, "Error"), " ", h("span", { class: "wl-dot wl-dot-sm wl-h-critical" })];
  if (view.insights === null) return ["— Insights"];
  const flag = view.insights > 0 && (view.health === "warning" || view.health === "opportunity");
  return [plural(view.insights, "Insight"), flag && h("span", { class: "wl-dot wl-dot-sm" })];
}

function cardButtons({ live, panel }: CardModel, a: CardActions): HTMLElement[] {
  const liveTitle = live ? "Live: follows the page you are on. Click to pause on what you see now." : "Paused: new calls and pages wait. Click to go live.";
  const on = (yes: boolean) => (yes ? " wl-on" : "");
  return [
    h("button", { type: "button", class: `wl-iconbtn${on(live)}`, onClick: () => a.toggleLive(), "aria-label": live ? "Pause" : "Go live", title: liveTitle }, live ? iconPause() : iconPlay()),
    h(
      "button",
      { type: "button", class: `wl-iconbtn${on(panel === "settings")}`, onClick: () => a.toggle("settings"), "aria-expanded": String(panel === "settings"), title: "Settings" },
      iconGear(),
    ),
    h("button", { type: "button", class: "wl-iconbtn", onClick: () => a.minimize(), title: "Minimize WizeLens" }, iconMinimize()),
  ];
}

function cardFoot(m: CardModel, a: CardActions): HTMLElement {
  const { req, view, link } = m;
  return h(
    "div",
    { class: "wl-foot" },
    count(link("sql"), "Database queries of this page and its calls", `${view.sql ?? (req ? "—" : 0)} SQL`),
    count(null, "Calls this page made: fetch and XHR. Open the details to see them", `${view.fetch ?? (req ? "—" : 0)} Fetch`),
    count(link(view.errors > 0 ? "errors" : "insights"), "Errors and hints: N+1, duplicate, and slow queries", issueLabel(m)),
    h("span", { class: "wl-spacer" }),
    cardButtons(m, a),
  );
}

/** The HUD card: the request on screen, its four timings with hover tips, the stacked bar, and the footer counts. */
export function card(m: CardModel, a: CardActions): HTMLElement {
  const failed = m.view.health === "critical" && (m.req?.server?.errorCount ?? 0) > 0;
  return h("div", { key: "card", class: `wl-card wl-h-${m.view.health}` }, cardHead(m, a), cardMetrics(m, a), stackBar(m.view, false, failed), cardFoot(m, a));
}
