import { fmtMs } from "../hud-model.js";
import type { RecordedRequest } from "../recorder-types.js";
import { h } from "./dom.js";
import { empty } from "./parts.js";

type RowKind = "browser" | "render" | "error";

export interface WfRow {
  key: string;
  name: string;
  startMs: number;
  durationMs: number;
  kind: RowKind;
  depth: number;
  barMs: number;
  /** Shown on hover after the name: the status. */
  title?: string;
  /** Opens this row's trace in the dashboard, in a new tab. */
  href?: string | null;
}

const failed = (r: RecordedRequest) => !!r.error || (r.status ?? 0) >= 500;

/** A call by the server's own name for it ("GET /api/boards/:id"), else its method and path, another origin's host last. */
export function callName(r: RecordedRequest): string {
  if (r.server?.name) return r.server.name;
  if (!/^https?:\/\//.test(r.path)) return `${r.method} ${r.path}`;
  const u = new URL(r.path);
  return `${r.method} ${u.pathname}${u.search} · ${u.host}`;
}

// One call: its name, with its query count when the server sent one.
function callRow(r: RecordedRequest, href: string | null, label: string): WfRow {
  const sql = r.server && r.server.dbCount > 0 ? ` · ${r.server.dbCount} SQL` : "";
  const ms = r.durationMs ?? 0;
  const title = r.status === null ? (r.error ? "failed" : "running") : String(r.status);
  return { key: r.id, name: `${callName(r)}${label}${sql}`, title, startMs: r.startMs, durationMs: ms, kind: failed(r) ? "error" : "browser", depth: 0, barMs: ms, href };
}

export interface RouteRender {
  startMs: number;
  renderMs: number | null;
}

/** Rows for a page: its load request and first paint (or the route render), then each call it made, oldest first. */
export function pageRows(calls: readonly RecordedRequest[], lead: RecordedRequest | null, route: RouteRender | null, link: (r: RecordedRequest) => string | null): WfRow[] {
  const rows: WfRow[] = [];
  if (route?.renderMs != null) rows.push({ key: "render", name: "Route render", startMs: route.startMs, durationMs: route.renderMs, kind: "render", depth: 0, barMs: route.renderMs });
  for (const r of calls) {
    rows.push(callRow(r, link(r), r === lead ? " (page)" : ""));
    if (r !== lead || r.durationMs === null || r.renderMs === null) continue;
    rows.push({ key: "render", name: "First paint", startMs: r.startMs + r.durationMs, durationMs: r.renderMs, kind: "render", depth: 1, barMs: r.renderMs });
  }
  return rows;
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 0.001)));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
}

export function ticksFor(total: number): number[] {
  const step = niceStep(total / 4);
  const ticks: number[] = [];
  for (let t = 0; t <= total + 0.001 && ticks.length < 8; t += step) ticks.push(t);
  return ticks;
}

// A last segment that is only a route parameter ("/{handler?}", "/:id") names nothing alone: the tail keeps the segment before it.
const PARAM_TAIL = /\/(?:\{[^}/]*\}|:\w+)$/;

/** Splits a name into its method, its path's middle and its last segment, so a cut keeps "GET" and "/members · 6 SQL" and drops the middle. */
export function splitName(name: string): [string, string, string] {
  const end = name.search(/ · | \(/);
  const path = end < 0 ? name : name.slice(0, end);
  let cut = path.lastIndexOf("/");
  if (cut > 0 && PARAM_TAIL.test(path)) cut = path.lastIndexOf("/", cut - 1);
  const [head, tail] = cut <= 0 ? [name, ""] : [name.slice(0, cut), name.slice(cut)];
  const method = tail ? (/^[A-Z]+ /.exec(head)?.[0] ?? "") : "";
  return [method, head.slice(method.length), tail];
}

const rowName = (r: WfRow) => {
  const [method, head, tail] = splitName(r.name);
  const parts = [method ? h("span", { class: "wl-wf-method" }, method) : null, head ? h("span", { class: "wl-wf-head" }, head) : null, tail ? h("span", { class: "wl-wf-tail" }, tail) : null];
  return r.href ? h("a", { href: r.href, target: "_blank", rel: "noreferrer" }, parts) : h("span", null, parts);
};

/** The timeline: `rows` on a shared time axis that starts at `origin`. */
export function waterfall(rows: WfRow[], origin: number): HTMLElement {
  if (rows.length === 0) return empty("No calls yet.");
  const start = Math.min(origin, ...rows.map((r) => r.startMs));
  const total = Math.max(1, ...rows.map((r) => r.startMs + r.barMs - start));
  const ticks = ticksFor(total);
  const left = (ms: number) => `${(ms / total) * 100}%`;
  const axis = h("div", { class: "wl-wf-axis" }, ticks.map((t) => h("span", { style: `left:${left(t)}` }, fmtMs(t))));
  const grid = () => ticks.slice(1).map((t) => h("span", { class: "wl-wf-grid", style: `left:${left(t)}` }));
  const row = (r: WfRow) => [
    h("div", { class: "wl-wf-name", style: `padding-left:${r.depth * 10}px`, title: `${r.name}${r.title ? ` · ${r.title}` : ""}\nstarts at +${fmtMs(r.startMs - start)}` }, rowName(r)),
    h("div", { class: "wl-wf-at" }, fmtMs(r.durationMs)),
    h("div", { class: "wl-wf-track" }, grid(), h("i", { class: `wl-k-${r.kind}`, style: `left:${left(r.startMs - start)};width:${left(r.barMs)}` })),
  ];
  return h("div", { class: "wl-wf" }, h("div"), h("div"), axis, rows.map(row));
}
