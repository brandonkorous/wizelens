// Small reads over infrastructure series: attributes, newest values, window rates, and lines.
import { METRIC_BUCKETS, metricBucketsOf, type MetricSeriesData } from "../metrics/from-rollups.js";
import { displayOf } from "../metrics/series.js";

export type Series = MetricSeriesData;
export type Line = (number | null)[];

/** The first attribute of `keys` the series has, as text; "" when none. Older and newer semantic-convention names are both read. */
export function attrOf(s: Pick<Series, "attributes">, ...keys: string[]): string {
  for (const k of keys) {
    const v = s.attributes[k];
    if (v !== null && v !== undefined && v !== "") return String(v);
  }
  return "";
}

export const stateOf = (s: Series) => attrOf(s, "state", "system.cpu.state", "cpu.mode", "system.memory.state", "system.filesystem.state");
export const directionOf = (s: Series) => attrOf(s, "direction", "network.io.direction", "disk.io.direction", "system.network.io.direction");

/** Series of one name (or the first of several names that has any). */
export function named(list: readonly Series[], names: string | readonly string[]): Series[] {
  for (const n of typeof names === "string" ? [names] : names) {
    const hit = list.filter((s) => s.name === n);
    if (hit.length > 0) return hit;
  }
  return [];
}

/** The newest value of a gauge or up-down sum. */
export const lastOf = (s: Series): number | null => s.total.lastV;

/** A counter's change per second over the window. */
export const rateOf = (s: Series): number | null => (s.total.rateMs > 0 ? (s.total.rateDelta / s.total.rateMs) * 1000 : null);

/** How much a gauge grew over the window (restarts counted since the window began). */
export const growthOf = (s: Series): number => Math.max(0, (s.total.lastV ?? 0) - (s.total.firstV ?? s.total.lastV ?? 0));

/** Sum of the values, or null when there are none. */
export function sumOf(values: readonly (number | null)[]): number | null {
  const vs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return vs.length === 0 ? null : vs.reduce((t, v) => t + v, 0);
}

export function avgOf(values: readonly (number | null)[]): number | null {
  const vs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return vs.length === 0 ? null : vs.reduce((t, v) => t + v, 0) / vs.length;
}

/** One series' line: the bucket average for values, the rate per second for counters. All null without lines. */
export function lineOf(s: Series): Line {
  if (!s.line) return new Array<number | null>(METRIC_BUCKETS).fill(null);
  return metricBucketsOf(displayOf(s), s.line, METRIC_BUCKETS).values;
}

/** Lines merged bucket by bucket with `merge` (sum or average). */
export function mergeLines(lines: readonly Line[], merge: (vs: (number | null)[]) => number | null = sumOf): Line {
  return Array.from({ length: METRIC_BUCKETS }, (_, i) => merge(lines.map((l) => l[i] ?? null)));
}

/** Series grouped by a text key; series with an empty key are left out. */
export function groupBy(list: readonly Series[], keyOf: (s: Series) => string): Map<string, Series[]> {
  const out = new Map<string, Series[]>();
  for (const s of list) {
    const k = keyOf(s);
    if (!k) continue;
    const hit = out.get(k);
    if (hit) hit.push(s);
    else out.set(k, [s]);
  }
  return out;
}

/** The newest time any series was seen. */
export const seenOf = (list: readonly Series[]): number => list.reduce((t, s) => Math.max(t, s.total.lastMs), 0);
