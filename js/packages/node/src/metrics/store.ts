import { type MetricPoint, sanitizeMetricPoint, seriesKeyOf } from "@wizeworks/lens-core/internal";

export interface MetricStoreOptions {
  service: string;
  redactKeys: readonly string[];
  /** Oldest point kept, in ms. Default 1 h. */
  maxAgeMs?: number;
  /** Most points kept. The oldest are dropped first. Default 50000. */
  maxPoints?: number;
  /** Most series kept. Points of new series past it are dropped. Default 1000. */
  maxSeries?: number;
  now?: () => number;
}

export type MetricListener = (points: readonly MetricPoint[]) => void;

export const MAX_METRIC_POINTS = 50_000;

/** The add-on's metrics: a time-ordered window of points, in memory only. */
export class MetricStore {
  readonly maxAgeMs: number;
  readonly maxPoints: number;
  readonly maxSeries: number;
  readonly #o: MetricStoreOptions;
  readonly #now: () => number;
  readonly #listeners = new Set<MetricListener>();
  readonly #series = new Map<string, number>();
  #points: MetricPoint[] = [];
  dropped = 0;

  constructor(options: MetricStoreOptions) {
    this.#o = options;
    this.maxAgeMs = Math.max(60_000, options.maxAgeMs ?? 60 * 60_000);
    this.maxPoints = Math.max(100, options.maxPoints ?? MAX_METRIC_POINTS);
    this.maxSeries = Math.max(1, options.maxSeries ?? 1000);
    this.#now = options.now ?? Date.now;
  }

  get size(): number {
    return this.#points.length;
  }

  get seriesCount(): number {
    return this.#series.size;
  }

  subscribe(listener: MetricListener): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  /** Check, redact, and keep points. Returns the ones kept. */
  add(raw: readonly unknown[]): MetricPoint[] {
    const kept: MetricPoint[] = [];
    for (const r of raw) {
      const p = sanitizeMetricPoint(r, this.#o.redactKeys, this.#o.service);
      if (p && this.#track(p)) kept.push(p);
    }
    if (kept.length === 0) return kept;
    this.#points.push(...kept);
    if (kept.some((p, i) => i > 0 && p.timeMs < kept[i - 1]!.timeMs) || this.#outOfOrder(kept)) this.#points.sort((a, b) => a.timeMs - b.timeMs);
    this.prune();
    for (const l of this.#listeners) l(kept);
    return kept;
  }

  #outOfOrder(kept: readonly MetricPoint[]): boolean {
    const before = this.#points[this.#points.length - kept.length - 1];
    return !!before && before.timeMs > kept[0]!.timeMs;
  }

  #track(p: MetricPoint): boolean {
    const key = seriesKeyOf(p);
    const count = this.#series.get(key);
    if (count === undefined && this.#series.size >= this.maxSeries) return void this.dropped++, false;
    this.#series.set(key, (count ?? 0) + 1);
    return true;
  }

  #forget(p: MetricPoint): void {
    const key = seriesKeyOf(p);
    const count = (this.#series.get(key) ?? 1) - 1;
    if (count <= 0) this.#series.delete(key);
    else this.#series.set(key, count);
  }

  /** Drop points past the age or count limit. */
  prune(): void {
    const cutoff = this.#now() - this.maxAgeMs;
    let drop = 0;
    while (drop < this.#points.length && (this.#points[drop]!.timeMs < cutoff || this.#points.length - drop > this.maxPoints)) drop++;
    if (drop === 0) return;
    for (const p of this.#points.splice(0, drop)) this.#forget(p);
  }

  /** Points at or after `sinceMs`, oldest first, at most `limit` (the newest are kept). */
  since(sinceMs = 0, limit = MAX_METRIC_POINTS): MetricPoint[] {
    this.prune();
    const from = this.#points.findIndex((p) => p.timeMs >= sinceMs);
    if (from < 0) return [];
    const list = this.#points.slice(from);
    return list.length > limit ? list.slice(list.length - limit) : list;
  }

  all(): readonly MetricPoint[] {
    this.prune();
    return this.#points;
  }
}
