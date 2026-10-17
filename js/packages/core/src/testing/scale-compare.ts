// Compare SQL executor results with the memory executor's, with the documented tolerances. Test-only: excluded from the build.
import type { TimeWindow } from "../stats/common.js";
import { type Agg, emptyAgg, trimAgg } from "../scale/agg.js";
import type { TraceFacts } from "../scale/facts.js";
import { addHist, histOf } from "../scale/hist.js";
import { KIND_SPEC } from "../scale/kinds.js";
import { keyMatches, type Need, type NeedResults, type PageContext, type SeriesNeed, type SeriesRows, windowOfRef } from "../scale/needs.js";
import { planSeries, spreadBucket } from "../scale/window.js";

const NONE: ReadonlySet<string> = new Set();
const close = (a: number, b: number) => a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** Differences between two values: numbers within float noise, ids as a subset of the memory ids. */
export function diff(sql: unknown, mem: unknown, path: string, out: string[], skip: ReadonlySet<string> = NONE): void {
  if (out.length > 20 || skip.has(path.slice(path.lastIndexOf(".") + 1))) return;
  if (path.endsWith(".ids") && Array.isArray(sql) && Array.isArray(mem)) {
    if (!sql.every((id) => mem.includes(id)) || (mem.length > 0) !== (sql.length > 0)) out.push(`${path}: ${JSON.stringify(sql)} vs ${JSON.stringify(mem)}`);
    return;
  }
  if (typeof sql === "number" && typeof mem === "number") {
    if (!close(sql, mem)) out.push(`${path}: ${sql} vs ${mem}`);
    return;
  }
  if (sql && mem && typeof sql === "object" && typeof mem === "object") {
    if (Array.isArray(sql) !== Array.isArray(mem) || (Array.isArray(sql) && sql.length !== (mem as unknown[]).length)) return void out.push(`${path}: shape ${JSON.stringify(sql).slice(0, 300)} vs ${JSON.stringify(mem).slice(0, 300)}`);
    const keys = new Set([...Object.keys(sql), ...Object.keys(mem)]);
    for (const k of keys) diff((sql as Record<string, unknown>)[k], (mem as Record<string, unknown>)[k], `${path}.${k}`, out, skip);
    return;
  }
  if (sql !== mem && !(sql === undefined && mem === null) && !(sql === null && mem === undefined)) out.push(`${path}: ${JSON.stringify(sql)} vs ${JSON.stringify(mem)}`);
}

/** True when page buckets are whole tier buckets, so tier placement equals item placement. */
export function seriesExact(w: TimeWindow, buckets: number, now: number, retentionMs: number): boolean {
  const { tier } = planSeries(w, buckets, now, retentionMs);
  const size = (w.to - w.from) / buckets;
  return Number.isInteger(size / tier.ms) && w.from % tier.ms === 0;
}

/** A series as the SQL executor places items: by their tier bucket, assigned by midpoint or spread by overlap. */
export function tierSeries(facts: readonly TraceFacts[], need: SeriesNeed, w: TimeWindow, now: number, retentionMs: number): SeriesRows {
  const spec = KIND_SPEC[need.kind];
  const plan = planSeries(w, need.buckets, now, retentionMs);
  const fresh = () => Array.from({ length: need.buckets }, () => trimAgg(emptyAgg(spec.hist), { hist: need.hist, times: false }));
  const byKey: Record<string, Agg[]> = need.split ? {} : { "": fresh() };
  const ms = plan.tier.ms;
  for (const c of facts.flatMap((f) => f.contributions)) {
    if (c.kind !== need.kind || !keyMatches(c.key, need.filter)) continue;
    const b = Math.floor(c.timeMs / ms) * ms;
    const mid = b + ms / 2;
    const index = Math.min(need.buckets - 1, Math.floor(((mid - w.from) / (w.to - w.from)) * need.buckets));
    const targets = plan.mode === "split" ? spreadBucket(b, ms, w, need.buckets) : mid >= w.from && mid < w.to ? [{ index, share: 1 }] : [];
    if (!targets.length) continue;
    const list = (byKey[need.split ? c.key : ""] ??= fresh());
    for (const t of targets) {
      const a = list[t.index]!;
      a.n += c.n * t.share;
      a.err += c.err * t.share;
      a.sum += c.sum * t.share;
      c.c?.forEach((v, i) => (a.c[i] = a.c[i]! + v * t.share));
      if (a.hist && c.values?.length) addHist(a.hist, Object.fromEntries(Object.entries(histOf(c.values)).map(([k, v]) => [k, v * t.share])));
    }
  }
  return { byKey };
}

export interface CompareOptions {
  ctx: PageContext;
  facts: readonly TraceFacts[];
  retentionMs: number;
  /** Fields to leave out, such as display fields that subtraction never changes. */
  skip?: ReadonlySet<string>;
}

/** Every difference between SQL and memory results for the needs. */
export function compareResults(sql: NeedResults, mem: NeedResults, needs: readonly Need[], o: CompareOptions): string[] {
  const out: string[] = [];
  const d = (a: unknown, b: unknown, path: string) => diff(a, b, path, out, o.skip);
  for (const need of needs) {
    if (need.type === "groups") d(sql.groups[need.id], mem.groups[need.id], need.id);
    else if (need.type === "list") d(sql.lists[need.id], mem.lists[need.id], need.id);
    else if (need.type === "trace") d(sql.traces[need.id]?.traceId ?? null, mem.traces[need.id]?.traceId ?? null, need.id);
    else {
      const w = windowOfRef(o.ctx, need.window);
      const exact = seriesExact(w, need.buckets, o.ctx.now, o.retentionMs);
      d(sql.series[need.id], exact ? mem.series[need.id] : tierSeries(o.facts, need, w, o.ctx.now, o.retentionMs), need.id);
      if (!exact) d(seriesTotal(sql.series[need.id]!), seriesTotal(mem.series[need.id]!), `${need.id}.total`);
    }
  }
  return out;
}

/** n, err, and sum over all buckets and keys: placement aside, nothing is lost. */
export const seriesTotal = (s: SeriesRows): number[] =>
  Object.values(s.byKey).flat().reduce((t, a) => [t[0]! + a.n, t[1]! + a.err, t[2]! + a.sum], [0, 0, 0]);
