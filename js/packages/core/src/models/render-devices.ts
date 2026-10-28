// Page views by device (Phone, Tablet, Desktop): each route's views and render time on each, and the totals.
import { type Agg, avgOfAgg } from "../scale/agg.js";
import { histPercentile } from "../scale/hist.js";
import { splitKey } from "../scale/kinds.js";
import type { Need, NeedResults, WindowRef } from "../scale/needs.js";
import type { Device } from "../user-agent.js";
import { groupNeed, rowsOf, sumAggs } from "./read.js";

export const DEVICES: readonly Device[] = ["Phone", "Tablet", "Desktop"];

export interface DeviceCell {
  views: number;
  avgMs: number;
  p75Ms: number | null;
}

/** One row: a route (or every route) with a cell per device; null where that device never opened it. */
export interface DeviceRow {
  route: string;
  cells: Record<Device, DeviceCell | null>;
}

export interface DeviceTable {
  all: DeviceRow;
  routes: DeviceRow[];
}

const id = (win: WindowRef) => `dev.${win}`;

export const deviceNeeds = (win: WindowRef): Need[] => [groupNeed(id(win), "pv.dev", win, { hist: true })];

const cellOf = (a: Agg | undefined): DeviceCell | null => (a && a.n > 0 ? { views: a.n, avgMs: avgOfAgg(a) ?? 0, p75Ms: a.hist ? histPercentile(a.hist, a.n, 75) : null } : null);

function rowOf(route: string, by: Map<Device, Agg[]>): DeviceRow {
  const cells = Object.fromEntries(DEVICES.map((dev) => [dev, cellOf(by.has(dev) ? sumAggs(by.get(dev)!) : undefined)])) as Record<Device, DeviceCell | null>;
  return { route, cells };
}

/** Routes by device, the most viewed on phones first, then by all views. */
export function deviceTableOf(d: NeedResults, win: WindowRef): DeviceTable {
  const byRoute = new Map<string, Map<Device, Agg[]>>();
  const all = new Map<Device, Agg[]>();
  for (const r of rowsOf(d, id(win))) {
    const [route = "", dev] = splitKey(r.key) as [string, Device];
    if (!DEVICES.includes(dev)) continue;
    const m = byRoute.get(route) ?? new Map<Device, Agg[]>();
    m.set(dev, [...(m.get(dev) ?? []), r.agg]);
    byRoute.set(route, m);
    all.set(dev, [...(all.get(dev) ?? []), r.agg]);
  }
  const views = (row: DeviceRow) => DEVICES.reduce((t, dev) => t + (row.cells[dev]?.views ?? 0), 0);
  const routes = [...byRoute].map(([route, by]) => rowOf(route, by)).sort((a, b) => (b.cells.Phone?.views ?? 0) - (a.cells.Phone?.views ?? 0) || views(b) - views(a) || a.route.localeCompare(b.route));
  return { all: rowOf("All pages", all), routes };
}
