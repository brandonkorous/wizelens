import type { Need, PageData } from "../scale/needs.js";
import type { TimeRange, TimeWindow } from "../stats/common.js";
import { type Compare, compareLabelOf } from "../stats/period.js";
import { groupNeed, totalOf } from "./read.js";

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
}

/** What every page needs for its meta: whether the window before had traces. */
export const META_NEEDS: readonly Need[] = [groupNeed("meta.prev", "trace", "prev")];

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

/** The page and page size a list asks for. */
export const pageParams = (p: ModelParams, defaultSize: number): { page: number; size: number } => ({
  page: intParam(p, "page", 1, 1, 1_000_000),
  size: intParam(p, "size", defaultSize, 5, 5000),
});
