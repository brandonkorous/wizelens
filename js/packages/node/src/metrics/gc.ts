import { constants, type PerformanceEntry } from "node:perf_hooks";
import type { MetricPoint } from "@wizeworks/lens-core";

/** OTel advice for `v8js.gc.duration`, in seconds. */
export const GC_BOUNDS = [0.01, 0.1, 1, 10];

const KINDS: Record<number, string> = {
  [constants.NODE_PERFORMANCE_GC_MAJOR]: "major",
  [constants.NODE_PERFORMANCE_GC_MINOR]: "minor",
  [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: "incremental",
  [constants.NODE_PERFORMANCE_GC_WEAKCB]: "weakcb",
};

interface Bins {
  count: number;
  sum: number;
  min: number;
  max: number;
  counts: number[];
}

/** Collects GC pauses between samples and turns them into delta histogram points. */
export class GcHistogram {
  #bins = new Map<string, Bins>();

  /** Add one `gc` performance entry. Its duration is in ms. */
  record(entry: Pick<PerformanceEntry, "duration"> & { detail?: unknown }): void {
    const kind = KINDS[(entry.detail as { kind?: number } | undefined)?.kind ?? -1] ?? "major";
    const seconds = entry.duration / 1000;
    const b = this.#bins.get(kind) ?? { count: 0, sum: 0, min: seconds, max: seconds, counts: new Array(GC_BOUNDS.length + 1).fill(0) };
    const i = GC_BOUNDS.findIndex((bound) => seconds <= bound);
    b.counts[i < 0 ? GC_BOUNDS.length : i]++;
    b.count++;
    b.sum += seconds;
    b.min = Math.min(b.min, seconds);
    b.max = Math.max(b.max, seconds);
    this.#bins.set(kind, b);
  }

  /** The pauses since the last call, one point per GC type, then start over. */
  drain(startMs: number, timeMs: number): MetricPoint[] {
    const out = [...this.#bins].map(([kind, b]) => ({
      name: "v8js.gc.duration",
      kind: "histogram" as const,
      unit: "s",
      description: "Garbage collection duration.",
      service: "",
      temporality: "delta" as const,
      attributes: { "v8js.gc.type": kind },
      timeMs,
      startMs,
      histogram: { count: b.count, sum: b.sum, min: b.min, max: b.max, bounds: [...GC_BOUNDS], counts: b.counts },
    }));
    this.#bins.clear();
    return out;
  }
}
