import { metricsModel, type TimeRange } from "@wizeworks/lens-core";
import type { McpDataSource } from "../mcp-shared.js";
import type { WizeLensOptions } from "../types.js";
import { RuntimeCollector } from "./runtime.js";
import { MetricStore } from "./store.js";

export interface MetricParts {
  store: MetricStore;
  collector: RuntimeCollector;
}

/** The metric store and runtime collector, or null when `captureMetrics` is false. Call `start` on the collector. */
export function createMetricParts(o: WizeLensOptions, redactKeys: readonly string[]): MetricParts | null {
  if (o.captureMetrics === false) return null;
  const store = new MetricStore({ service: o.serviceName, redactKeys, maxAgeMs: o.metricsMaxAgeMs });
  const collector = new RuntimeCollector({ intervalMs: o.metricsIntervalMs, add: (points) => void store.add(points) });
  return { store, collector };
}

/** In-app ranges: the add-on keeps an hour by default. */
const IN_APP_RANGES: readonly TimeRange[] = ["15m", "1h"];

/** The MCP metric tools' view of the store. */
export function mcpMetrics(store: MetricStore | null): Pick<McpDataSource, "metrics" | "metricRanges"> {
  if (!store) return {};
  return { metrics: (range, params) => metricsModel({ points: store.all(), range, now: Date.now(), params }), metricRanges: IN_APP_RANGES };
}
