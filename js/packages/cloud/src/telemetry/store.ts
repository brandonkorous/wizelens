// Where the cloud keeps telemetry: spans, logs, metrics, and their stats. Accounts, keys, and settings always stay in Postgres.
import type { Executor, MetricAlertData, MetricData, SearchPage, SearchQuery, Suggestion, SuggestRequest, TimeRange, TimeWindow, Trace } from "@wizeworks/lens-core";
import type { HubWrite } from "@wizeworks/lens-hub/kit";

export interface TraceQuery {
  projectId: string;
  /** Changed at or after (server clock). */
  since?: number;
  /** Started before. For paging back. */
  before?: number;
  /** Started at or after. For time windows. */
  from?: number;
  env?: string;
  session?: string;
  limit: number;
}

export interface MetricQuery {
  projectId: string;
  env?: string;
  service?: string;
}

/** How long each project's organization keeps data, in days; the default when a project has none. */
export type RetentionOf = (projectIds: readonly string[]) => Promise<Map<string, number>>;

export interface SettleOptions {
  defaultRetentionDays?: number;
  batch?: number;
  budgetMs?: number;
}

/** One telemetry backend. Postgres ("small mode") and ClickHouse ("scale mode") answer the same calls with the same results. */
export interface TelemetryStore {
  readonly kind: "postgres" | "clickhouse";
  /** Spans, logs, trace bounds, and metric points of one batch. */
  write(projectId: string, w: HubWrite, now: number): Promise<void>;
  traces(t: TraceQuery): Promise<Trace[]>;
  trace(projectId: string, traceId: string): Promise<Trace | undefined>;
  /** One trace with its parts from the other projects in `scope` (already checked by the caller). */
  joinedTrace(primaryId: string, scope: readonly string[], traceId: string): Promise<Trace | undefined>;
  counts(projectId: string): Promise<{ traces: number; spans: number }>;
  /** Environments seen on traces. */
  traceEnvs(projectId: string): Promise<string[]>;
  /** Distinct hours with a trace in (from, to]. */
  activeHours(projectId: string, from: number, to: number): Promise<number>;
  /** The newest trace start per project; projects without traces are left out. */
  lastTraceMs(): Promise<Map<string, number>>;
  /** Page needs from the project's stats. */
  executor(projectId: string, retentionMs: number, env?: string): Executor;
  /** Traces still waiting for their stats, or null when none. */
  settling(projectId: string, env?: string): Promise<number | null>;
  search(projectId: string, q: SearchQuery): Promise<SearchPage>;
  suggest(projectId: string, r: SuggestRequest): Promise<Suggestion[]>;
  /** The slowest endpoints by p95 in a window, with at least `minCount` requests. */
  slowestEndpoints(projectId: string, w: TimeWindow, minCount: number, limit: number): Promise<{ endpoint: string; p95Ms: number; count: number }[]>;
  metricData(m: MetricQuery, range: TimeRange, params: Readonly<Record<string, string>>, now: number): Promise<MetricData>;
  metricAlertData(m: MetricQuery, name: string, w: TimeWindow, now: number): Promise<MetricAlertData>;
  /** Build stats for quiet traces. Returns how many settled. */
  settle(now: number, o?: SettleOptions): Promise<number>;
  /** Drop traces, metrics, and rollups past each organization's retention. */
  prune(now: number): Promise<void>;
  /** Age out the short rollup tiers. */
  pruneRollups(now: number): Promise<void>;
  /** On startup: rebuild the stats when the facts version changed. True when it did. */
  checkFactsVersion(): Promise<boolean>;
  /** Delete every trace, span, log, metric, and stat of a project. */
  clearProject(projectId: string): Promise<void>;
  close(): Promise<void>;
}
