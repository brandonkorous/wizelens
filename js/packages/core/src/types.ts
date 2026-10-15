// Wire contract v0. See docs/CONTRACT.md.

export type SpanKind = "server" | "client" | "internal" | "producer" | "consumer";
export type SpanStatus = "unset" | "ok" | "error";
export type SpanCategory = "http.server" | "http.client" | "db" | "browser" | "internal";
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

export interface ServiceInfo {
  service: string;
  version: string;
  runtime: string;
  mcp: boolean;
}

export const HEADER_TRACE = "X-WizeLens-Trace";
export const HEADER_ENDPOINT = "X-WizeLens-Endpoint";
export const HEADER_HOP = "X-WizeLens-Hop";
export const HEADER_TRACEPARENT = "traceparent";
export const MAX_FEDERATION_HOPS = 5;
export const DEFAULT_BASE_PATH = "/_wizelens";
/** Browser span attribute that ties a span to one browser tab. */
export const ATTR_BROWSER_SESSION = "wizelens.browser.session";
/** sessionStorage key that holds the per-tab session id. */
export const SESSION_STORAGE_KEY = "wizelens.session";
