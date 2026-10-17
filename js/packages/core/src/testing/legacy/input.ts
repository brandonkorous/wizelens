import { COMPARE_LABEL, inWindow, previousWindow, type TimeRange, type TimeWindow, windowOf } from "../../stats/common.js";
import { type RequestRow, requestRows } from "../../stats/requests.js";
import type { Trace } from "../../types.js";

export interface ModelOptions {
  slowQueryMs: number;
}

/** Page parameters from the URL: filters, the selected item, paging. */
export type ModelParams = Readonly<Record<string, string>>;

/** What a page model is computed from. The browser (in-app, hub) and the server (cloud) build it the same way. */
export interface ModelInput {
  range: TimeRange;
  window: TimeWindow;
  prev: TimeWindow;
  traces: readonly Trace[];
  prevTraces: readonly Trace[];
  requests: readonly RequestRow[];
  prevRequests: readonly RequestRow[];
  options: ModelOptions;
  params: ModelParams;
  /** Set when the host read only the newest part of the traces in the two windows. */
  sampled: Sampled | null;
}

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
  sampled: Sampled | null;
}

/** Split traces into the chosen window and the one before it. */
export function modelInput(all: readonly Trace[], range: TimeRange, now: number, options: ModelOptions, params: ModelParams, sampled: Sampled | null = null): ModelInput {
  const window = windowOf(range, now);
  const prev = previousWindow(window);
  const traces = all.filter((t) => inWindow(t.startMs, window));
  const prevTraces = all.filter((t) => inWindow(t.startMs, prev));
  return { range, window, prev, traces, prevTraces, requests: requestRows(traces), prevRequests: requestRows(prevTraces), options, params, sampled };
}

export const metaOf = (i: ModelInput): ModelMeta => ({
  range: i.range,
  window: i.window,
  prev: i.prev,
  compareLabel: COMPARE_LABEL[i.range],
  hasPrev: i.prevTraces.length > 0,
  sampled: i.sampled,
});

/** A whole-number URL parameter, within bounds. */
export function intParam(p: ModelParams, key: string, fallback: number, min: number, max: number): number {
  const n = Number(p[key]);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
}

/** One page of a list, and how many there are in all. */
export function pageOf<T>(items: readonly T[], p: ModelParams, defaultSize: number): { items: T[]; total: number; page: number; pageSize: number } {
  const pageSize = intParam(p, "size", defaultSize, 5, 5000);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(intParam(p, "page", 1, 1, 1_000_000), pages);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
}
