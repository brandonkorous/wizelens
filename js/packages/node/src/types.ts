import type { IncomingMessage, ServerResponse } from "node:http";
import type { Tracer } from "@opentelemetry/api";
import type { TagOptions, Trace } from "@wizeworks/lens-core";
import type { LogOptions } from "./loose-logs.js";
import type { SamplingOptions } from "./sampling.js";
import type { SourceMapOptions } from "./sourcemaps.js";
import type { TraceStore } from "./store.js";

export interface WizeLensOptions {
  /** Service name shown in the dashboard, e.g. "orders-api". */
  serviceName: string;
  /** Base path for the dashboard and API. Default "/_wizelens". */
  basePath?: string;
  /** Turn WizeLens on. Default: the WIZELENS_ENABLED variable, else on unless NODE_ENV is "production". */
  enabled?: boolean;
  /** Serve the dashboard, read API, and MCP. Off is send-only: capture and send, no reads. Default: WIZELENS_DASHBOARD, else off in production. */
  dashboard?: boolean;
  /** Put the HUD script tag on the full HTML pages this service answers, while the dashboard is served. Default: WIZELENS_HUD, else true. */
  hud?: boolean;
  /** Where traces live. "sqlite" keeps them across restarts. Default "sqlite", or "memory" when the dashboard is off. */
  storage?: "sqlite" | "memory";
  /** SQLite file for `storage: "sqlite"`. Default `{cwd}/.wizelens/traces.db`. */
  storagePath?: string;
  /** Max traces kept (memory and file). Default 2000. */
  maxTraces?: number;
  /** Max trace age in ms (memory and file). Default 24 h. */
  maxAgeMs?: number;
  /** Expose the read-only MCP endpoint at `{basePath}/mcp`. Default false. */
  enableMcp?: boolean;
  /** Key fragments to redact. Default: the contract list. */
  redactKeys?: string[];
  /** Override the `X-WizeLens-Endpoint` value (useful behind proxies). */
  publicEndpoint?: string;
  /** Override where the dashboard build lives. */
  uiDir?: string;
  /** Capture outgoing fetch / undici calls. Default true. */
  instrumentFetch?: boolean;
  /** Capture outgoing `node:http` / `node:https` calls, so axios, got, node-fetch v2, and the AWS SDK are traced too. Default true. */
  instrumentHttp?: boolean;
  /** Database adapters also trace queries that run outside a request (startup, jobs). Default false. */
  traceQueriesOutsideRequests?: boolean;
  /** Copy `console.log`, `warn`, `error`, `info`, `debug`, and `trace` calls into WizeLens (into their request trace, or outside one as loose lines). Default true. */
  captureConsole?: boolean;
  /** Keep runtime metrics (CPU, memory, heap, event loop, GC) and app metrics from `wizelensMetricExporter`. Default true. */
  captureMetrics?: boolean;
  /** How often runtime metrics are sampled, in ms. Default 10000. */
  metricsIntervalMs?: number;
  /** Oldest metric point kept, in ms. Default 1 h. Metrics are kept in memory only. */
  metricsMaxAgeMs?: number;
  /** Also write wizelens logs to the console. Default false. */
  logToConsole?: boolean;
  /** Where MCP audit lines go. Default console.info. */
  audit?: (line: string) => void;
  /** Keep the first 16 KB of text and JSON response bodies. Default false. */
  captureResponseBody?: boolean;
  /** Trace files served as they are (images, fonts, scripts) that succeed. Default false; WIZELENS_STATIC_FILES=true turns it on. */
  traceStaticFiles?: boolean;
  /** Send the hub the names and versions of the installed packages once at start, for the known-vulnerability check. Default true; WIZELENS_PACKAGES=false turns it off. */
  reportPackages?: boolean;
  /** Queries at or over this many ms are slow. Default 100. */
  slowQueryMs?: number;
  /** Repeats that make an N+1 pattern. Default 5. */
  nPlusOneThreshold?: number;
  /** The project this service belongs to, so a shared hub can group it. Default: the WIZELENS_PROJECT variable. */
  project?: string;
  /** The app's version, kept on every span as `service.version` for release markers, version compares, and Problems. Default: WIZELENS_RELEASE, OTEL_SERVICE_VERSION, a commit variable (SOURCE_VERSION, GIT_SHA, GIT_COMMIT, VERCEL_GIT_COMMIT_SHA, RENDER_GIT_COMMIT), npm_package_version, then the app's package.json. */
  release?: string;
  /** Also send everything to this local hub, for example "http://localhost:5960". Default: the WIZELENS_HUB variable. */
  hub?: string;
  /** Access token for the hub. Default: the WIZELENS_HUB_TOKEN variable. */
  hubToken?: string;
  /** Other WizeLens services on another origin that browser calls go to, like "https://localhost:5099" for an API on its own port: their part of a call joins its trace here. Default: the comma-separated WIZELENS_TRUSTED_REMOTES variable. */
  trustedRemotes?: string[];
  /** Keep only part of the traces, for busy services. Default: all, or the WIZELENS_SAMPLE_RATE variable. */
  sampling?: SamplingOptions;
  /** Where browser stacks find their source maps: build folders and dev servers on this machine (default). False turns it off. */
  sourceMaps?: SourceMapOptions | false;
  /** Lines written outside a request (startup, jobs, timers): on or off, the lowest level, and a sample rate. Default: on, "info" and up, all. */
  logs?: LogOptions;
  /** Tag rules: `{ rules: [{ name: "checkout", query: "route:/checkout*", color: "green" }], disableBuiltIns: ["bot"] }`. A bad rule throws at startup. */
  tags?: TagOptions;
}

export interface DbCallInfo {
  /** OTel `db.system.name`, e.g. "sqlite", "postgresql", "mysql". */
  system: string;
  /** Adapter name for `wizelens.db.adapter`, e.g. "node-sqlite", "pg", "prisma". */
  adapter?: string;
  /** Database name for `db.namespace`. */
  namespace?: string;
  /** Override the parsed operation (SELECT, INSERT, ...). */
  operation?: string;
  /** Override the parsed table / collection. */
  collection?: string;
  /** Rows in a result that is not a plain array, for `db.response.returned_rows`. */
  rowsOf?: (result: unknown) => number | undefined;
  /** An ORM-level call: driver calls inside it are part of this span, not new ones. */
  outermost?: boolean;
  /** Skip the span when no request (or other span) is active. Set by the database adapters. */
  requireParent?: boolean;
  /** More span attributes, for example `server.address`, `db.operation.batch.size`, or `wizelens.db.fingerprint`. */
  attributes?: Record<string, string | number>;
}

export type LogFn = (message: string, attributes?: Record<string, unknown>) => void;

export interface WizeLensLogger {
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  critical: LogFn;
  /** Logger with a custom category. */
  child(category: string): WizeLensLogger;
}

export type Next = (err?: unknown) => void;

/** More about a user for `setUser`. */
export interface UserOptions {
  /** A display name for the Users page (`user.full_name`). Leave it out to keep only the id; a project can also redact `user.full_name`. */
  name?: string;
}

export type Req = IncomingMessage & { originalUrl?: string; body?: unknown; route?: { path?: unknown }; baseUrl?: string };

export interface WizeLens {
  readonly enabled: boolean;
  readonly serviceName: string;
  readonly basePath: string;
  readonly store: TraceStore;
  /** The SQLite file in use, or null when traces are kept in memory only. */
  readonly storagePath: string | null;
  readonly tracer: Tracer;
  /** Express / Connect middleware. Traces requests and serves `{basePath}`. Mount it first. */
  middleware: (req: IncomingMessage, res: ServerResponse, next: Next) => void;
  /** Express error middleware. Mount it after your routes to record exceptions. */
  errorMiddleware: (err: unknown, req: IncomingMessage, res: ServerResponse, next: Next) => void;
  /** Plain Node handler for `{basePath}` only. Resolves false when the request is not for WizeLens. */
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  /** Wrap one database call (sync or async). Driver-level floor for any database. */
  traceDb<T>(info: DbCallInfo, sql: string, params: unknown, fn: () => T): T;
  logger: WizeLensLogger;
  /** Record an exception on the active span. */
  recordException(err: unknown): void;
  /** Tag the current request, e.g. tag("cache", "hit") shows as "cache:hit". No-op outside a request. */
  tag(key: string, value?: string): void;
  /** Mark the current request's answer as expected, e.g. a deliberate 503: a 5xx is then not a failure. An exception still is. No-op outside a request. */
  expected(): void;
  /** Set the user of the current request (`enduser.id`), with a display name for the Users page. No-op outside a request. */
  setUser(id: string, options?: UserOptions): void;
  /** Get one trace, optionally federated across downstream services. */
  getTrace(traceId: string, federate?: boolean, hop?: number): Promise<Trace | undefined>;
  shutdown(): Promise<void>;
}
