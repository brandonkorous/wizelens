import type { HistogramStat } from "./series.js";

/** One tile on the runtime strip: the first of `names` a service sends is shown. */
export interface RuntimeMetricDef {
  key: string;
  label: string;
  names: readonly string[];
  /** Histograms show this stat. */
  stat?: HistogramStat;
}

/** Well-known OpenTelemetry runtime metrics for Node and .NET (and other runtimes that use the same names). */
export const RUNTIME_METRICS: readonly RuntimeMetricDef[] = [
  { key: "cpu", label: "CPU", names: ["process.cpu.utilization", "dotnet.process.cpu.time", "process.cpu.time"] },
  { key: "memory", label: "Memory", names: ["process.memory.usage", "dotnet.process.memory.working_set", "process.runtime.dotnet.working_set", "go.memory.used"] },
  { key: "heap", label: "Heap", names: ["v8js.memory.heap.used", "dotnet.gc.last_collection.heap.size", "jvm.memory.used"] },
  { key: "loop", label: "Event loop delay", names: ["nodejs.eventloop.delay.p99"] },
  { key: "gc", label: "GC", names: ["dotnet.gc.pause.time", "v8js.gc.duration", "jvm.gc.duration"], stat: "p95" },
  { key: "threads", label: "Thread pool queue", names: ["dotnet.thread_pool.queue.length"] },
  { key: "requests", label: "Request time", names: ["http.server.request.duration"], stat: "p95" },
];
