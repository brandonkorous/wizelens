import { availableParallelism } from "node:os";
import { type EventLoopUtilization, monitorEventLoopDelay, PerformanceObserver, performance } from "node:perf_hooks";
import { getHeapStatistics } from "node:v8";
import { context, ROOT_CONTEXT } from "@opentelemetry/api";
import type { Attributes, MetricPoint } from "@wizeworks/lens-core/internal";
import { GcHistogram } from "./gc.js";

export interface RuntimeCollectorOptions {
  /** How often to sample. Default 10000 ms. */
  intervalMs?: number;
  add: (points: MetricPoint[]) => void;
  now?: () => number;
}

type Sample = { cpu: NodeJS.CpuUsage; atMs: number; elu: EventLoopUtilization };

const gauge = (name: string, unit: string, value: number, timeMs: number, description: string, attributes: Attributes = {}): MetricPoint => ({
  name,
  kind: "gauge",
  unit,
  description,
  service: "",
  attributes,
  timeMs,
  value,
});

const cpuTime = (mode: string, seconds: number, timeMs: number, startMs: number): MetricPoint => ({
  name: "process.cpu.time",
  kind: "sum",
  unit: "s",
  description: "Total CPU seconds by mode.",
  service: "",
  monotonic: true,
  temporality: "cumulative",
  attributes: { "cpu.mode": mode },
  timeMs,
  startMs,
  value: seconds,
});

/** Samples CPU, memory, heap, event loop, and GC every interval. Never traced, never keeps the process alive. */
export class RuntimeCollector {
  readonly #o: RuntimeCollectorOptions;
  readonly #now: () => number;
  readonly #gc = new GcHistogram();
  readonly #startMs: number;
  #loop: ReturnType<typeof monitorEventLoopDelay> | undefined;
  #observer: PerformanceObserver | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #last: Sample;

  constructor(options: RuntimeCollectorOptions) {
    this.#o = options;
    this.#now = options.now ?? Date.now;
    this.#startMs = this.#now() - process.uptime() * 1000;
    this.#last = { cpu: process.cpuUsage(), atMs: this.#now(), elu: performance.eventLoopUtilization() };
  }

  start(): void {
    if (this.#timer) return;
    context.with(ROOT_CONTEXT, () => {
      this.#loop = monitorEventLoopDelay({ resolution: 20 });
      this.#loop.enable();
      this.#observer = new PerformanceObserver((list) => list.getEntries().forEach((e) => this.#gc.record(e)));
      this.#observer.observe({ entryTypes: ["gc"] });
      this.#timer = setInterval(() => context.with(ROOT_CONTEXT, () => this.#o.add(this.sample())), this.#o.intervalMs ?? 10_000);
      this.#timer.unref?.();
    });
  }

  /** One round of runtime points. Rates cover the time since the last round. */
  sample(): MetricPoint[] {
    const now = this.#now();
    const cpu = process.cpuUsage();
    const elu = performance.eventLoopUtilization();
    const last = this.#last;
    const wallS = Math.max(0.001, (now - last.atMs) / 1000);
    const cpuS = (cpu.user - last.cpu.user + cpu.system - last.cpu.system) / 1e6;
    const heap = getHeapStatistics();
    const points = [
      gauge("process.cpu.utilization", "1", cpuS / wallS / availableParallelism(), now, "CPU used by the process, as a share of all CPUs."),
      cpuTime("user", cpu.user / 1e6, now, this.#startMs),
      cpuTime("system", cpu.system / 1e6, now, this.#startMs),
      gauge("process.memory.usage", "By", process.memoryUsage.rss(), now, "Resident memory of the process."),
      gauge("v8js.memory.heap.used", "By", heap.used_heap_size, now, "V8 heap in use."),
      gauge("v8js.memory.heap.limit", "By", heap.heap_size_limit, now, "V8 heap size limit."),
      gauge("nodejs.eventloop.utilization", "1", performance.eventLoopUtilization(elu, last.elu).utilization, now, "Share of time the event loop was busy."),
      ...this.#loopPoints(now),
      ...this.#gc.drain(last.atMs, now),
    ];
    this.#last = { cpu, atMs: now, elu };
    return points;
  }

  #loopPoints(now: number): MetricPoint[] {
    const h = this.#loop;
    if (!h || h.count === 0) return [];
    const points = [
      gauge("nodejs.eventloop.delay.p50", "s", h.percentile(50) / 1e9, now, "Event loop delay, median."),
      gauge("nodejs.eventloop.delay.p99", "s", h.percentile(99) / 1e9, now, "Event loop delay, 99th percentile."),
      gauge("nodejs.eventloop.delay.max", "s", h.max / 1e9, now, "Event loop delay, longest."),
    ];
    h.reset();
    return points;
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#loop?.disable();
    this.#observer?.disconnect();
  }
}
