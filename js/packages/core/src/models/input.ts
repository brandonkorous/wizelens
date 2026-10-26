import type { Need, PageData } from "../scale/needs.js";
import type { TimeRange, TimeWindow } from "../stats/common.js";
import { type Compare, compareLabelOf } from "../stats/period.js";
import type { Release } from "../releases.js";
import { groupNeed, totalOf } from "./read.js";
import { releasesNeed, releasesOf } from "./release-rows.js";

export interface ModelOptions {
  slowQueryMs: number;
}

/** Page parameters from the URL: filters, the selected item, paging. */
export type ModelParams = Readonly<Record<string, string>>;

export interface Sampled {
  used: number;
  total: number;
}

/** Shared by every model: the time range and how complete the data is. */
export interface ModelMeta {
  range: TimeRange;
  window: TimeWindow;
  prev: TimeWindow;
  compareLabel: string;
  hasPrev: boolean;
  /** Always null: pages read whole windows now. Kept so older clients keep working. */
  sampled: Sampled | null;
  /** Traces still waiting for their stats; null or 0 when the stats are complete. */
  settling: number | null;
  /** True for a custom from–to window. */
  custom: boolean;
  compare: Compare;
  /** Versions that first sent data in this window, newest first: the release markers on charts. */
  releases: Release[];
}

/** What every page needs for its meta: whether the window before had traces, and the releases. */
export const META_NEEDS: readonly Need[] = [groupNeed("meta.prev", "trace", "prev"), releasesNeed("meta.rel")];

export const metaOf = (d: PageData): ModelMeta => ({
  range: d.range,
  window: d.window,
  prev: d.prev,
  compareLabel: compareLabelOf(d.range, !!d.custom, d.compare ?? "previous"),
  hasPrev: totalOf(d, "meta.prev").n > 0,
  sampled: null,
  settling: d.settling ?? null,
  custom: !!d.custom,
  compare: d.compare ?? "previous",
  releases: releasesOf(d, "meta.rel").filter((r) => r.firstMs >= d.window.from && r.firstMs < d.window.to),
});

/** The service filter (a display name, as the dashboard shows it), or undefined for all services. */
export const serviceParam = (p: ModelParams): string | undefined => p.service?.trim() || undefined;

/** Need fields for one service, or none for all of them. */
export const scoped = (service: string | undefined): { service?: string } => (service ? { service } : {});

/** A whole-number URL parameter, within bounds. */
export function intParam(p: ModelParams, key: string, fallback: number, min: number, max: number): number {
  const n = Number(p[key]);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
}

/** Rows-per-page choices. A list shows its pager only when it has more rows than the smallest. */
export const PAGE_SIZES: readonly number[] = [15, 30, 50, 100];

/** The page and page size a list asks for; `key` names one of several lists on a page ("ep" reads epage and epsize). */
export const pageParams = (p: ModelParams, defaultSize: number, key = ""): { page: number; size: number } => ({
  page: intParam(p, `${key}page`, 1, 1, 1_000_000),
  size: intParam(p, `${key}size`, defaultSize, 5, 5000),
});

/** One page of rows; a page past the end shows the last page. */
export function slicePage<T>(rows: readonly T[], page: number, size: number): { rows: T[]; page: number } {
  const last = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(Math.max(1, Math.floor(page)), last);
  return { rows: rows.slice((at - 1) * size, at * size), page: at };
}
