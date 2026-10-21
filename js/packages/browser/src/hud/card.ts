import type { TraceView } from "@wizeworks/lens-core";
import { fmtMs, plural, type RequestView } from "../hud-model.js";
import type { RecordedRequest } from "../recorder-types.js";
import { type Child, h } from "./dom.js";
import { iconBolt, iconChevron, iconGear, iconMinimize } from "./icons.js";
import { stackBar, statusPill } from "./parts.js";
import type { Panel } from "./storage.js";
import { dbTip, renderTip, serverTip, totalTip } from "./tips.js";

export interface CardModel {
  req: RecordedRequest | null;
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

function metric(id: string, label: string, value: number | null, valueClass: string, tip: Child[] | null, onClick: () => void): HTMLElement {
  const tipId = `wl-tip-${id}`;
  const button = h(
    "button",
    { type: "button", class: "wl-metric", onClick, "aria-describedby": tip ? tipId : null },
    h("span", { class: `wl-val ${value === null ? "" : valueClass}` }, fmtMs(value)),
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

function cardMetrics({ req, view, link }: CardModel, a: CardActions): HTMLElement {
  const details = () => a.details();
  return h(
    "div",
    { class: "wl-metrics" },
    metric("total", "Total", view.totalMs, "", req && totalTip(view, link("timeline")), details),
    metric("server", "Server", view.serverMs, "", req && serverTip(req, view, link("http")), details),
    metric("db", "Database", view.dbMs, "wl-v-db", req && dbTip(req, view, link("sql")), details),
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
  const liveTitle = live ? "Live: shows the newest request. Click to pin this one." : "Paused on this request. Click to follow the newest.";
  const on = (yes: boolean) => (yes ? " wl-on" : "");
  return [
    h("button", { type: "button", class: `wl-iconbtn${on(live)}`, onClick: () => a.toggleLive(), "aria-pressed": String(live), title: liveTitle }, iconBolt()),
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
    count(link("sql"), "Database queries in this request", `${view.sql ?? (req ? "—" : 0)} SQL`),
    count(link("http"), "HTTP calls this request made to other services", `${view.fetch ?? (req ? "—" : 0)} Fetch`),
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
