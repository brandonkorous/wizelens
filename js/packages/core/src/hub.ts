import type { LogRecord, Span } from "./types.js";

/** Default port of the local hub. */
export const HUB_DEFAULT_PORT = 5960;
/** Environment variable that points an add-on at a hub, for example "http://localhost:5960". */
export const HUB_ENV = "WIZELENS_HUB";
/** Environment variable with the hub's access token, when the hub needs one. */
export const HUB_TOKEN_ENV = "WIZELENS_HUB_TOKEN";
/** Environment variable with the project a service belongs to. One hub can hold many projects. */
export const PROJECT_ENV = "WIZELENS_PROJECT";
/** A service is "online" when the hub heard from it this recently. */
export const HUB_ONLINE_MS = 30_000;

/** Who sends a batch to the hub. */
export interface HubSender {
  service: string;
  /** The project (later: the cloud tenant) this service belongs to. Groups services on a shared hub. */
  project?: string;
  version?: string;
  /** For example "node v24.1.0", ".NET 10.0.1", or "otlp python". */
  runtime?: string;
  environment?: string;
  host?: string;
  /** The add-on's own WizeLens URL, when it has one. The hub skips it when it federates. */
  endpoint?: string;
  startedMs?: number;
}

/** One log line and the trace it belongs to. */
export interface HubLog {
  traceId: string;
  log: LogRecord;
}

/** A downstream WizeLens endpoint that a trace called. */
export interface HubRemote {
  traceId: string;
  endpoint: string;
}

/** `POST {hub}/_wizelens/api/ingest`. An empty batch is a heartbeat. */
export interface IngestBatch {
  sender: HubSender;
  spans?: Span[];
  logs?: HubLog[];
  remotes?: HubRemote[];
}

/** One service the hub knows, from `GET {hub}/_wizelens/api/services`. */
export interface HubService extends HubSender {
  /** "addon" for WizeLens add-ons, "otlp" for plain OpenTelemetry senders. */
  via: "addon" | "otlp";
  firstSeenMs: number;
  lastSeenMs: number;
  online: boolean;
}

/** Normalize a hub URL from config: trim, drop a trailing slash and a trailing "/_wizelens". */
export function normalizeHubUrl(raw: string | undefined | null): string | null {
  const v = raw?.trim().replace(/\/+$/, "").replace(/\/_wizelens$/, "");
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `http://${v}`;
}
