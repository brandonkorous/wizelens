import type { MetricsModel, SearchPage, SearchQuery, Suggestion, SuggestRequest, TimeRange, Trace, TraceSummary } from "@wizeworks/lens-core";

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
  /** Search on the host's store. Without it, the search tools read `all()` in memory. */
  search?(q: SearchQuery): SearchPage | Promise<SearchPage>;
  /** Autocomplete on the host's store. Without it, `all()` in memory. */
  suggest?(r: SuggestRequest): Suggestion[] | Promise<Suggestion[]>;
  /** The host's clock, for search ranges. Default Date.now. */
  now?(): number;
  /** The environment memory search gives this service's documents (in-app), as the HTTP search does. */
  env?: string;
}

export type Audit = (tool: string, args: unknown) => void;

export const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

export const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});
