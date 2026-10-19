// Service level objectives: a share of good requests (successful, or fast enough) over 7 or 30 days, and the error budget left.
import { joinKey } from "../scale/kinds.js";
import { histCountAtMost } from "../scale/hist.js";
import type { Agg } from "../scale/agg.js";
import type { Need, PageContext, PageDef } from "../scale/needs.js";
import { bucketStarts, previousWindow } from "../stats/common.js";
import { rawService } from "../stats/errors.js";
import { type AlertNoticeState, type AlertOp, conditionText } from "./alerts.js";
import { groupNeed, seriesNeed, seriesOf, totalOf } from "./read.js";

export type SloKind = "success" | "latency";

/** What a person sets. */
export interface SloInput {
  name: string;
  /** A service (display name), and optionally one endpoint of it. */
  service: string;
  endpoint: string;
  /** Good means not failed ("success"), or not failed and at most `thresholdMs` ("latency"). */
  kind: SloKind;
  /** Percent of requests that must be good, for example 99.9. */
  target: number;
  thresholdMs: number;
  windowDays: 7 | 30;
}

export interface Slo extends SloInput {
  id: string;
  projectId: string;
}

export const SLO_WINDOWS = [7, 30] as const;
const DAY_MS = 86_400_000;
const SLO_BUCKETS = 48;

/** Requests of the SLO's scope: the service's (`req`), or one endpoint's (`svc.ep`), with histograms for latency. */
function scopeNeed(id: string, s: Pick<Slo, "service" | "endpoint" | "kind">, window: "cur", series = false): Need {
  const hist = s.kind === "latency";
  if (s.endpoint) {
    const filter = { keys: [joinKey(`api:${rawService(s.service)}`, s.endpoint)] };
    return series ? seriesNeed(id, "svc.ep", window, SLO_BUCKETS, { filter, hist }) : groupNeed(id, "svc.ep", window, { filter, hist });
  }
  return series ? seriesNeed(id, "req", window, SLO_BUCKETS, { service: s.service, hist }) : groupNeed(id, "req", window, { service: s.service, hist });
}

/** Good requests of an aggregate. */
export const goodOf = (s: Pick<Slo, "kind" | "thresholdMs">, a: Pick<Agg, "n" | "err" | "hist">): number =>
  s.kind === "success" || !a.hist ? a.n - a.err : Math.max(0, histCountAtMost(a.hist, s.thresholdMs) - a.err);

/** The window ending now: the SLO's 7 or 30 days, or any span (for burn rates). */
export function sloContext(windowMs: number, now: number): PageContext {
  const window = { from: now - windowMs, to: now };
  return { range: windowMs > 7 * DAY_MS ? "30d" : "7d", window, prev: previousWindow(window), now, params: {}, options: { slowQueryMs: 100 }, settling: null };
}

export const sloWindowMs = (s: Pick<Slo, "windowDays">): number => s.windowDays * DAY_MS;

export interface SloStatus {
  total: number;
  good: number;
  /** Percent good; null with no requests. */
  sli: number | null;
  /** Share of the error budget still left: 1 is all of it, 0 is spent, below 0 is over. Null with no requests. */
  budgetLeft: number | null;
  starts: number[];
  /** Percent good per bucket, and the budget left at the end of each bucket. */
  sliSeries: (number | null)[];
  budgetSeries: (number | null)[];
}

const allowedBad = (s: Pick<Slo, "target">, total: number) => ((100 - s.target) / 100) * total;

/** The SLO over its window: totals, budget, and how both moved. Run with `sloContext(sloWindowMs(s), now)`. */
export const sloPage = (s: Slo): PageDef<SloStatus> => ({
  needs: () => [scopeNeed("slo", s, "cur"), scopeNeed("slo.s", s, "cur", true)],
  model(d) {
    const all = totalOf(d, "slo");
    const good = goodOf(s, all);
    const buckets = seriesOf(d, "slo.s", SLO_BUCKETS);
    let total = 0;
    let bad = 0;
    const budgetSeries = buckets.map((a) => {
      total += a.n;
      bad += a.n - goodOf(s, a);
      return total ? 1 - bad / Math.max(allowedBad(s, total), 1e-9) : null;
    });
    const budget = allowedBad(s, all.n);
    return {
      total: all.n,
      good,
      sli: all.n ? (good / all.n) * 100 : null,
      budgetLeft: all.n ? 1 - (all.n - good) / Math.max(budget, 1e-9) : null,
      starts: bucketStarts(d.window, SLO_BUCKETS),
      sliSeries: buckets.map((a) => (a.n ? (goodOf(s, a) / a.n) * 100 : null)),
      budgetSeries,
    };
  },
});

/** "SLO Checkout availability burns its budget 14.2× as fast as allowed (above 10×)". */
export function sloBurnMessage(name: string, op: AlertOp, value: number | null, threshold: number, state: AlertNoticeState = "fired"): string {
  const fmt = (n: number) => `${n.toFixed(1)}×`;
  const shown = value === null ? "has no requests to measure" : `burns its budget ${fmt(value)} as fast as allowed`;
  return `SLO ${name} ${shown} (${conditionText(op, fmt(threshold), state)})`;
}

/** How fast the budget burns over a context's window: the bad share over the allowed bad share. 1 spends it exactly on time. */
export const sloBurnPage = (s: Slo): PageDef<number | null> => ({
  needs: () => [scopeNeed("slo", s, "cur")],
  model(d) {
    const a = totalOf(d, "slo");
    return a.n ? (a.n - goodOf(s, a)) / a.n / Math.max((100 - s.target) / 100, 1e-9) : null;
  },
});
