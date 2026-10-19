import type { ZodTypeAny } from "zod";
import { type MetricsModel, type ModelOf, type SearchPage, type SearchQuery, type Suggestion, type SuggestRequest, type TagRule, tagList, type TimeRange, type Trace } from "@wizeworks/lens-core";

/** The page models get_overview and list_problems read. */
export type OverviewPage = "overview" | "services" | "errors" | "problems";

/** What the MCP tools can read. Read-only by design. */
export interface McpDataSource {
  service: string;
  version: string;
  /** Default threshold for find_slow_queries. */
  slowQueryMs: number;
  /** Default repeats for find_n_plus_one. */
  nPlusOneThreshold: number;
  /** Recent traces, newest first, for the tools that read whole traces in memory. A host may load them only when a tool asks. */
  all(): Trace[] | Promise<Trace[]>;
  get(traceId: string, federate: boolean): Promise<Trace | undefined>;
  audit(line: string): void;
  /** The metrics page for a range and page parameters. Without it, the metric tools are left out. */
  metrics?(range: TimeRange, params: Record<string, string>): MetricsModel | Promise<MetricsModel>;
  /** Ranges the metric tools offer, shortest first. Default all. */
  metricRanges?: readonly TimeRange[];
  /** Search on the host's store. Without it, the search, list, error, and slow query tools read `all()` in memory. */
  search?(q: SearchQuery): SearchPage | Promise<SearchPage>;
  /** Autocomplete on the host's store. Without it, `all()` in memory. */
  suggest?(r: SuggestRequest): Suggestion[] | Promise<Suggestion[]>;
  /** The host's clock, for search ranges. Default Date.now. */
  now?(): number;
  /** The environment memory search gives this service's documents (in-app), as the HTTP search does. */
  env?: string;
  /** One dashboard page's model, from the host's stats. Without it, get_overview is left out. */
  page?<P extends OverviewPage>(page: P, range: TimeRange): Promise<ModelOf<P>>;
  /** The project's tags (docs/TAGS-PLAN.md). Without it, only the built-ins. */
  tags?(): readonly TagRule[] | Promise<readonly TagRule[]>;
}

/** The tags a tool reads: the host's, or the built-ins. */
export const tagsOf = async (data: McpDataSource): Promise<readonly TagRule[]> => (data.tags ? await data.tags() : tagList([], new Set()));

/** One project a multi-project host serves. */
export interface McpProject {
  id: string;
  name: string;
}

/** A host that serves several projects (the cloud with a read key for many). Tools then take a `project` argument. */
export interface McpProjects {
  service: string;
  version: string;
  slowQueryMs: number;
  nPlusOneThreshold: number;
  /** True when every project has the metric tools. */
  metrics: boolean;
  metricRanges?: readonly TimeRange[];
  /** True when every project has get_overview. */
  overview?: boolean;
  projects: readonly McpProject[];
  /** The data of one project from `projects`. */
  open(projectId: string): Promise<McpDataSource>;
  /** Audit for calls that read no project (list_projects). */
  audit(line: string): void;
}

/** Defaults and features the tools are registered with: the same for every project. */
export interface McpDefaults {
  slowQueryMs: number;
  nPlusOneThreshold: number;
  metrics: boolean;
  metricRanges?: readonly TimeRange[];
  overview: boolean;
}

/** Where the tools read. */
export interface Source {
  defaults: McpDefaults;
  /** The `project` argument, on a multi-project host; else empty. */
  arg: Record<string, ZodTypeAny>;
  /** The data for one tool call, after the call is audited. */
  open(tool: string, args: object): Promise<McpDataSource>;
  /** Several projects: the data of each, for a call that names none. Each one is audited. */
  each?(tool: string, args: object): Promise<{ project: McpProject; data: McpDataSource }[]>;
}

export const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

export const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});
