import type { Need, PageData } from "../scale/needs.js";
import { COMPARE_LABEL, type TimeRange, type TimeWindow } from "../stats/common.js";
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
}

/** What every page needs for its meta: whether the window before had traces. */
export const META_NEEDS: readonly Need[] = [groupNeed("meta.prev", "trace", "prev")];

export const metaOf = (d: PageData): ModelMeta => ({
  range: d.range,
  window: d.window,
  prev: d.prev,
  compareLabel: COMPARE_LABEL[d.range],
  hasPrev: totalOf(d, "meta.prev").n > 0,
  sampled: null,
  settling: d.settling ?? null,
});

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
