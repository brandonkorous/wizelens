// Wire contract v0. See docs/CONTRACT.md.
import type { SamplingInfo } from "./sampling.js";

export type SpanKind = "server" | "client" | "internal" | "producer" | "consumer";
export type SpanStatus = "unset" | "ok" | "error";
export type SpanCategory = "http.server" | "http.client" | "db" | "messaging" | "browser" | "internal" | "uptime";
export type AttributeValue = string | number | boolean | null;
export type Attributes = Record<string, AttributeValue>;
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "critical";

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: SpanKind;
  category: SpanCategory;
  service: string;
  startMs: number;
  durationMs: number;
  status: SpanStatus;
  statusMessage: string | null;
  attributes: Attributes;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timeMs: number;
  attributes: Attributes;
}

export interface LogRecord {
  timeMs: number;
  level: LogLevel;
  category: string;
  message: string;
  service: string;
  spanId: string | null;
  attributes: Attributes;
}

export interface TraceSummary {
  traceId: string;
  rootName: string;
  service: string;
  startMs: number;
  durationMs: number;
  status: SpanStatus;
  spanCount: number;
  dbCount: number;
  httpClientCount: number;
  errorCount: number;
  services: string[];
  /** `http.request.method` of the root span. */
  rootMethod: string | null;
  /** `url.path`, else `url.full`, of the root span. */
  rootUrl: string | null;
  /** `http.response.status_code` of the root span, else of the entry server span (a page load's root is its page view). */
  rootStatusCode: number | null;
}

export interface Trace extends TraceSummary {
  spans: Span[];
  logs: LogRecord[];
  remotes: string[];
}

/** Where WizeLens runs: inside the app, as a local hub, or in the cloud. */
export type HostMode = "in-app" | "hub" | "cloud";

/** Optional features a host offers. The dashboard shows or hides parts by these, never by the mode name. */
export type Capability =
  | "federation"
  | "environments"
  | "registry"
  | "accounts"
  | "alerts"
  | "sharing"
  | "serverStats"
  /** The host keeps metrics: raw points at `api/metrics/points` (in-app), or with `serverMetrics`, the page at `api/models/metrics`. */
  | "metrics"
  | "serverMetrics"
  /** The host answers `api/search` and `api/search/suggest` (docs/SEARCH-PLAN.md). */
  | "search"
  /** The host streams `api/changes` (server-sent events) when a project gets new stats, so pages reload at once. */
  | "changes"
  /** The host keeps issue states: error groups and insights can be resolved, ignored, and (cloud) assigned. */
  | "issues"
  /** The host answers `api/models/hosts` and `api/models/kubernetes` from OpenTelemetry Collector metrics. */
  | "infra"
  /** The host runs uptime checks: `api/uptime` (hub) or `api/projects/<id>/uptime` (cloud), and the `uptime` page model. */
  | "uptime"
  /** Projects can turn on a public status page at `api/status/<token>`. */
  | "statusPages"
  /** The host checks the packages services report against OSV; the Security page lists known-vulnerable ones. */
  | "packages"
  /** The host resolves browser stacks at `api/sourcemaps/resolve` (uploaded maps, a build folder, or a dev server). */
  | "sourcemaps"
  /** The host keeps SLOs and Apdex targets (`api/slos`, `api/apdex`). */
  | "slos"
  /** The host keeps saved views, saved searches (log searches charted on the Logs page), and dashboards (`api/saved`); without it the Logs page keeps its charted searches in the browser. */
  | "saved"
  /** The host answers `api/tags` and `api/tags/match` (docs/TAGS-PLAN.md); `editable` in `api/tags` says if rules can change there. */
  | "tags"
  /** The host keeps settings per project (thresholds, extra redacted keys, retention): `api/settings`. */
  | "settings";

/** What an in-app add-on offers today. Also the default when a host does not say. */
export const IN_APP_CAPABILITIES: readonly Capability[] = ["federation"];

/** Sending to a hub or the cloud: "waiting" before the first batch, "ok" once one went through, "failing" with why the last one did not. */
export interface SendState {
  state: "waiting" | "ok" | "failing";
  /** Why the hub took nothing, and what to change: "The hub needs a key (401). Set WIZELENS_TOKEN…". */
  reason?: string;
  /** When a batch last went through (epoch ms). */
  lastSentMs?: number;
}

export interface ServiceInfo {
  /** The wire contract version (PROTOCOL_VERSION). Absent means 1. */
  protocol?: number;
  /** Absent on older add-ons; read it as "in-app". */
  mode?: HostMode;
  /** Absent on older add-ons; read it as IN_APP_CAPABILITIES. */
  capabilities?: Capability[];
  service: string;
  version: string;
  runtime: string;
  mcp: boolean;
  /** For example "Development". From ASPNETCORE_ENVIRONMENT or NODE_ENV. */
  environment?: string;
  /** Machine name of the service. */
  host?: string;
  /** When the service started (epoch ms). */
  startedMs?: number;
  /** Where traces are kept. No `maxTraces` means no count limit (the cloud keeps by retention only). */
  storage?: { kind: "sqlite" | "memory" | "postgres"; maxTraces?: number; maxAgeMs: number };
  analysis?: { slowQueryMs: number; nPlusOneThreshold: number };
  redactKeys?: string[];
  /** True when response bodies are captured. */
  captureResponseBody?: boolean;
  /** The project this service belongs to, when one is set. */
  project?: string;
  /** The hub or cloud this add-on sends to (its base URL), when one is set. */
  sendTo?: string;
  /** How sending to `sendTo` goes. Absent on add-ons that do not report it. */
  send?: SendState;
  /** Absent when the add-on keeps every trace. */
  sampling?: SamplingInfo;
}

/** The wire contract version. A breaking change is version 2, served at `api/v2/…`; version 1 stays where it is. */
export const PROTOCOL_VERSION = 1;
export const HEADER_TRACE = "X-WizeLens-Trace";
export const HEADER_ENDPOINT = "X-WizeLens-Endpoint";
export const HEADER_HOP = "X-WizeLens-Hop";
/** Response header: the app expected this answer, so a 5xx is not a failure (a deliberate 503 "come back later"). */
export const HEADER_EXPECTED = "X-WizeLens-Expected";
export const HEADER_TRACEPARENT = "traceparent";
export const MAX_FEDERATION_HOPS = 5;
/** `Server-Timing` metrics that carry the trace id and endpoint to the page, which cannot read a document's headers. */
export const TIMING_TRACE = "wl-trace";
export const TIMING_ENDPOINT = "wl-endpoint";
/** `Server-Timing` metric with the epoch ms the server answered, so a page opened much later starts its own trace. */
export const TIMING_START = "wl-start";

/** The `Server-Timing` value for one response. */
export const serverTimingValue = (traceId: string, endpoint: string, startMs: number = Date.now()): string =>
  `${TIMING_TRACE};desc=${traceId}, ${TIMING_ENDPOINT};desc=${JSON.stringify(endpoint)}, ${TIMING_START};desc=${Math.round(startMs)}`;
export const DEFAULT_BASE_PATH = "/_wizelens";
/** sessionStorage key that holds the per-tab session id. */
export const SESSION_STORAGE_KEY = "wizelens.session";

/** Parts of the dashboard trace page a link can open: `#/traces/<id>/<view>`. */
export const TRACE_VIEWS = ["timeline", "sql", "http", "messages", "logs", "errors", "insights", "security"] as const;
export type TraceView = (typeof TRACE_VIEWS)[number];
export const isTraceView = (v: string | undefined): v is TraceView => (TRACE_VIEWS as readonly string[]).includes(v ?? "");
