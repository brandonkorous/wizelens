import type { MetricsModel, TimeRange, Trace, TraceSummary } from "@wizeworks/lens-core";

/** What the MCP tools can read. Read-only by design. */
export interface McpDataSource {
  service: string;
  version: string;
  /** Default threshold for find_slow_queries. */
  slowQueryMs: number;
  /** Default repeats for find_n_plus_one. */
  nPlusOneThreshold: number;
  list(limit: number): TraceSummary[];
  all(): Trace[];
  get(traceId: string, federate: boolean): Promise<Trace | undefined>;
  audit(line: string): void;
  /** The metrics page for a range and page parameters. Without it, the metric tools are left out. */
  metrics?(range: TimeRange, params: Record<string, string>): MetricsModel | Promise<MetricsModel>;
  /** Ranges the metric tools offer, shortest first. Default all. */
  metricRanges?: readonly TimeRange[];
}

export type Audit = (tool: string, args: unknown) => void;

export const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

export const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});
