import { fmtMs, type RequestView, share } from "../hud-model.js";
import type { RecordedRequest } from "../recorder-types.js";
import { type Child, h } from "./dom.js";
import { dashLink, widthOf } from "./parts.js";

type Parts = NonNullable<NonNullable<RecordedRequest["server"]>["parts"]>;

function tipHead(title: string, ms: number | null, total: number | null): Child[] {
  const part = ms !== total ? share(ms, total) : "";
  return [h("h4", null, title), h("div", { class: "wl-tip-big" }, fmtMs(ms), part && h("span", { class: "wl-tip-sub" }, ` (${part})`))];
}

/** Opens the dashboard in a new tab. Hidden when the server has no trace for the request. */
const tipLink = (text: string, href: string | null) => (href ? dashLink(href, text, "wl-link") : null);

/** One legend row: a color key, a label, and a time. */
function row(cls: string | null, label: string, ms: number | null): Child[] {
  return [h("dt", null, cls && h("i", { class: `wl-key ${cls}` }), label), h("dd", null, fmtMs(ms))];
}

export function totalTip(view: RequestView, href: string | null, what = "Request start to the next paint"): Child[] {
  const s = view.segments;
  const rows = s && [row("wl-c-server", "Server code", s.server), row("wl-c-db", "Database", s.db), row("wl-c-render", "Render", s.render), row("wl-c-other", "Network and other", s.other)];
  return [
    tipHead("Total", view.totalMs, view.totalMs),
    h("div", { class: "wl-tip-sub" }, what),
    rows && h("dl", null, rows),
    tipLink("View the timeline", href),
  ];
}

function serverParts(p: Parts, total: number, others: string[]): Child[] {
  const seg = (cls: string, ms: number) => h("i", { class: cls, style: widthOf(ms, total) });
  return [
    h("div", { class: "wl-bar", "aria-hidden": "true" }, seg("wl-c-server", p.codeMs), seg("wl-c-db", p.dbMs), seg("wl-c-other", p.httpOutMs)),
    h("dl", null, row("wl-c-server", "Own code", p.codeMs), row("wl-c-db", "Own queries", p.dbMs), row("wl-c-other", `HTTP out (${p.httpOutCount})`, p.httpOutMs)),
    others.length > 0 && h("p", null, `Also called: ${others.join(", ")}`),
  ];
}

export function serverTip(req: RecordedRequest, view: RequestView, href: string | null, scope: string | null = null): Child[] {
  const srv = req.server;
  return [
    tipHead("Server", view.serverMs, view.totalMs),
    scope && h("div", { class: "wl-tip-sub" }, scope),
    !srv && h("p", null, req.profiled ? "Loading server data…" : "No server data for this request."),
    srv?.parts && serverParts(srv.parts, view.serverMs || 1, srv.services.slice(1)),
    tipLink("View the server calls", href),
  ];
}

function spark(durations: number[]): HTMLElement {
  const max = Math.max(1, ...durations);
  // Square root keeps one slow query from flattening the others.
  const bar = (ms: number) => h("i", { style: `height:${Math.max(6, Math.sqrt(ms / max) * 100)}%` });
  return h("div", { class: "wl-spark", "aria-hidden": "true" }, durations.map(bar));
}

function dbRows(srv: NonNullable<RecordedRequest["server"]>): HTMLElement {
  const addedUp = srv.dbTotalMs !== null && srv.dbMs !== null && srv.dbTotalMs - srv.dbMs >= 1;
  return h(
    "dl",
    null,
    row(null, "Slowest query", srv.dbSlowestMs),
    row(null, "Avg. query", srv.dbTotalMs === null ? null : srv.dbTotalMs / srv.dbCount),
    addedUp && row(null, "All queries added up", srv.dbTotalMs),
  );
}

export function dbTip(req: RecordedRequest, view: RequestView, href: string | null, scope: string | null = null): Child[] {
  const srv = req.server;
  const bars = srv?.dbDurations.slice(0, 40) ?? [];
  return [
    tipHead("Database", view.dbMs, view.totalMs),
    h("div", { class: "wl-tip-sub" }, srv ? (srv.dbCount === 1 ? "1 query" : `${srv.dbCount} queries`) : req.profiled ? "Loading server data…" : "No server data for this request.", scope && ` · ${scope}`),
    bars.length > 0 && spark(bars),
    srv && srv.dbCount > 0 && dbRows(srv),
    tipLink("View all queries", href),
  ];
}

export function renderTip(view: RequestView, href: string | null): Child[] {
  const text =
    view.renderMs === null
      ? "Not measured. The app did not read the response body, or the tab was hidden."
      : "From the response to the next paint: read the body, run your code, render, paint.";
  return [tipHead("Render", view.renderMs, view.totalMs), h("p", null, text), tipLink("View the timeline", href)];
}
