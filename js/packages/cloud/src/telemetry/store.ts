// Where the cloud keeps telemetry: spans, logs, metrics, and their stats. Accounts, keys, and settings always stay in Postgres.
import type { Executor, FactOptions, MetricAlertData, MetricData, MetricSqlScope, SearchPage, SearchQuery, SqlScope, Suggestion, SuggestRequest, TimeRange, TimeWindow, Trace } from "@wizeworks/lens-core";
import type { HubWrite } from "@wizeworks/lens-hub/kit";

declare const TENANT: unique symbol;

/** What one read may see: one organization and some of its projects. Only `tenantScope` builds one, so no read goes out without both. */
export interface TenantScope {
  readonly org: string;
  readonly projects: readonly string[];
  /** Each project's label, for a read of many projects: rows named by a service stay apart ("api · Shop"). */
  readonly labels?: Readonly<Record<string, string>>;
  readonly [TENANT]: true;
}

/** A read scope. Throws on an empty organization or project list: a read never widens to "everything". */
export function tenantScope(org: string, projects: readonly string[], labels?: Readonly<Record<string, string>>): TenantScope {
  if (!org) throw new Error("A telemetry read needs its organization.");
  if (!projects.length || projects.some((p) => !p)) throw new Error("A telemetry read needs at least one project.");
  return { org, projects: [...new Set(projects)], ...(labels ? { labels } : {}) } as unknown as TenantScope;
}

/** One project's own scope. */
export const projectScope = (p: { id: string; orgId: string }): TenantScope => tenantScope(p.orgId, [p.id]);

/** The shared SQL's scope for a read. */
export const sqlScope = (s: TenantScope, env?: string): SqlScope => ({ org: s.org, projects: s.projects, labels: s.labels, env });

export interface TraceQuery {
  scope: TenantScope;
  /** Changed at or after (server clock). */
  since?: number;
  /** Started before. For paging back. */
  before?: number;
  /** Started at or after. For time windows. */
  from?: number;
  env?: string;
  session?: string;
  /** Leave out loose batches (lines outside a request), which are not traces to list. */
  noLoose?: boolean;
  limit: number;
}

export interface MetricQuery {
  scope: TenantScope;
  env?: string;
  service?: string;
}

/** The shared metric SQL's scope for a metric read. */
export const metricScope = (m: MetricQuery): MetricSqlScope => ({ org: m.scope.org, projects: m.scope.projects, env: m.env, service: m.service });

/** How long each project's organization keeps data, in days; the default when a project has none. */
export type RetentionOf = (projectIds: readonly string[]) => Promise<Map<string, number>>;

/** The organization of each project; deleted projects are left out. A project never moves, so the answer can be kept. */
export type OrgOf = (projectIds: readonly string[]) => Promise<Map<string, string>>;

/** Which waiting traces `settling` counts: one environment, and only those last written at or before `before`. */
export interface SettlingScope {
  env?: string;
  before?: number;
}

export interface SettleOptions {
  defaultRetentionDays?: number;
  /** The cloud's thresholds; a project's own settings win. */
  defaultFacts?: Partial<FactOptions>;
  batch?: number;
  budgetMs?: number;
  /** Called for each project whose stats a batch wrote. */
  onSettled?: (projectId: string) => void;
}

/** One telemetry backend. Postgres ("small mode") and ClickHouse ("scale mode") answer the same calls with the same results. */
export interface TelemetryStore {
  readonly kind: "postgres" | "clickhouse";
  /** Spans, logs, trace bounds, and metric points of one batch. */
  write(projectId: string, w: HubWrite, now: number): Promise<void>;
  /** Newest traces of the scope; a trace in several of its projects lists once, with every part. */
  traces(t: TraceQuery): Promise<Trace[]>;
  /** One trace's parts in the scope's projects. */
  trace(scope: TenantScope, traceId: string): Promise<Trace | undefined>;
  /** One trace with its parts from the other projects in `scope` (already checked by the caller); undefined when the primary project has none. */
  joinedTrace(primaryId: string, scope: TenantScope, traceId: string): Promise<Trace | undefined>;
  counts(scope: TenantScope): Promise<{ traces: number; spans: number }>;
  /** Environments seen on traces. */
  traceEnvs(scope: TenantScope): Promise<string[]>;
  /** Distinct hours with a trace in (from, to]. */
  activeHours(scope: TenantScope, from: number, to: number): Promise<number>;
  /** The newest trace start per project; projects without traces are left out. */
  lastTraceMs(): Promise<Map<string, number>>;
  /** Page needs from the scope's stats. */
  executor(scope: TenantScope, retentionMs: number, env?: string): Executor;
  /** Traces still waiting for their stats, or null when none. */
  settling(scope: TenantScope, o?: SettlingScope): Promise<number | null>;
  search(scope: TenantScope, q: SearchQuery): Promise<SearchPage>;
  suggest(scope: TenantScope, r: SuggestRequest): Promise<Suggestion[]>;
  /** The slowest endpoints by p95 in a window, with at least `minCount` requests. */
  slowestEndpoints(scope: TenantScope, w: TimeWindow, minCount: number, limit: number): Promise<{ endpoint: string; p95Ms: number; count: number }[]>;
  metricData(m: MetricQuery, range: TimeRange, params: Readonly<Record<string, string>>, now: number): Promise<MetricData>;
  metricAlertData(m: MetricQuery, name: string, w: TimeWindow, now: number): Promise<MetricAlertData>;
  /** Host and Kubernetes metric series for the Hosts and Kubernetes pages. */
  infraData(m: MetricQuery, range: TimeRange, params: Readonly<Record<string, string>>, now: number): Promise<MetricData>;
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
