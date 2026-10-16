// Wire contract v0. See docs/CONTRACT.md.

export type SpanKind = "server" | "client" | "internal" | "producer" | "consumer";
export type SpanStatus = "unset" | "ok" | "error";
export type SpanCategory = "http.server" | "http.client" | "db" | "messaging" | "browser" | "internal";
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
  /** `http.response.status_code` of the root span. */
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
export type Capability = "federation" | "environments" | "accounts" | "alerts" | "sharing" | "serverStats";

/** What an in-app add-on offers today. Also the default when a host does not say. */
export const IN_APP_CAPABILITIES: readonly Capability[] = ["federation"];

export interface ServiceInfo {
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
  storage?: { kind: "sqlite" | "memory"; maxTraces: number; maxAgeMs: number };
  analysis?: { slowQueryMs: number; nPlusOneThreshold: number };
  redactKeys?: string[];
  /** True when response bodies are captured. */
  captureResponseBody?: boolean;
}

export const HEADER_TRACE = "X-WizeLens-Trace";
export const HEADER_ENDPOINT = "X-WizeLens-Endpoint";
export const HEADER_HOP = "X-WizeLens-Hop";
export const HEADER_TRACEPARENT = "traceparent";
export const MAX_FEDERATION_HOPS = 5;
export const DEFAULT_BASE_PATH = "/_wizelens";
/** sessionStorage key that holds the per-tab session id. */
export const SESSION_STORAGE_KEY = "wizelens.session";

/** Parts of the dashboard trace page a link can open: `#/traces/<id>/<view>`. */
export const TRACE_VIEWS = ["timeline", "sql", "http", "logs", "errors", "insights"] as const;
export type TraceView = (typeof TRACE_VIEWS)[number];
export const isTraceView = (v: string | undefined): v is TraceView => (TRACE_VIEWS as readonly string[]).includes(v ?? "");
