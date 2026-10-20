// Saved views, saved searches (a log search can be a chart), and dashboards: one store per project, each item owned by a person and shared or not.
import type { HistogramStat } from "../metrics/series.js";
import { logSearchOf } from "./log-search.js";

export type SavedKind = "view" | "search" | "dashboard";
export type DashChartType = "line" | "area" | "bar" | "number" | "table";

/** One chart of a dashboard: one or more metrics, a `where` filter and a split, drawn one way. */
export interface DashPanel {
  id: string;
  title: string;
  type: DashChartType;
  metrics: { name: string; stat: HistogramStat | "" }[];
  /** "key=value" pairs, comma-separated; empty for every series. */
  where: string;
  /** An attribute key (or "service") to split lines by; empty for one line per metric. */
  group: string;
  /** 1 is half the page, 2 the whole width. */
  width: 1 | 2;
}

export interface SavedItem {
  id: string;
  /** Its project; "" for an item of the whole organization (saved under "All projects", cloud). */
  projectId: string;
  /** Its project's label in a list of many projects. */
  project?: string;
  kind: SavedKind;
  name: string;
  /** Views and searches: the address to open ("#/errors?service=api"). */
  href: string;
  /** Dashboards: their charts. */
  panels: DashPanel[];
  /** Log searches (href on the Logs page): drawn on the Logs page as a chart of the lines they match. */
  chart: boolean;
  /** Everyone in the project sees it (cloud); hub items are always shared. */
  shared: boolean;
  /** Who made it: a user id on the cloud, empty on the hub. */
  owner: string;
  ownerName: string;
  createdMs: number;
  updatedMs: number;
}

export type SavedInput = Pick<SavedItem, "kind" | "name" | "href" | "panels" | "chart" | "shared">;

export const MAX_DASH_PANELS = 24;
export const MAX_PANEL_METRICS = 6;
const TYPES: readonly DashChartType[] = ["line", "area", "bar", "number", "table"];
const STATS: readonly string[] = ["", "p50", "p95", "p99", "avg"];
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function panelOf(raw: unknown, i: number): DashPanel | string {
  const p = (raw ?? {}) as Record<string, unknown>;
  const type = TYPES.includes(p.type as DashChartType) ? (p.type as DashChartType) : null;
  if (!type) return `Chart ${i + 1}: pick a type: line, area, bar, number, or table.`;
  const metrics = (Array.isArray(p.metrics) ? p.metrics : []).map((m) => ({ name: text((m as { name?: unknown })?.name, 200), stat: text((m as { stat?: unknown })?.stat, 4) }));
  if (metrics.length === 0 || metrics.length > MAX_PANEL_METRICS || metrics.some((m) => !m.name || !STATS.includes(m.stat))) return `Chart ${i + 1}: pick 1 to ${MAX_PANEL_METRICS} metrics.`;
  const id = text(p.id, 40) || `p${i + 1}`;
  return { id, title: text(p.title, 100), type, metrics: metrics as DashPanel["metrics"], where: text(p.where, 500), group: text(p.group, 100), width: p.width === 2 ? 2 : 1 };
}

function panelsOf(raw: unknown): DashPanel[] | string {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > MAX_DASH_PANELS) return `A dashboard holds at most ${MAX_DASH_PANELS} charts.`;
  const out: DashPanel[] = [];
  for (const [i, p] of list.entries()) {
    const one = panelOf(p, i);
    if (typeof one === "string") return one;
    out.push(one);
  }
  return out;
}

/** A saved item from a body, or why it is not valid. Merge a change over the current item first. */
export function parseSaved(b: Record<string, unknown>): SavedInput | string {
  const kind = b.kind;
  if (kind !== "view" && kind !== "search" && kind !== "dashboard") return 'Set kind to "view", "search", or "dashboard".';
  const name = text(b.name, 100);
  if (!name) return "Give it a name.";
  const href = kind === "dashboard" ? "" : text(b.href, 2000);
  if (kind !== "dashboard" && !href.startsWith("#/")) return 'Set href to the page address, starting with "#/".';
  const panels = kind === "dashboard" ? panelsOf(b.panels) : [];
  if (typeof panels === "string") return panels;
  const chart = kind === "search" && b.chart === true && logSearchOf(href) !== null;
  return { kind, name, href, panels, chart, shared: b.shared === true };
}
