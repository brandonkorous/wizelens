import type { Attributes, Timing, Trace, TraceView } from "@wizeworks/lens-core";
import type { FrameworkHooks } from "./framework.js";

export interface RecordedRequest {
  /** Browser span id. */
  id: string;
  method: string;
  url: string;
  path: string;
  status: number | null;
  /** Request start to the response headers. Null while the request runs. */
  durationMs: number | null;
  /** Response to the next paint after the app read the body. Null until measured or when the body is not read. */
  renderMs: number | null;
  /** Trace id the server reported (X-WizeLens-Trace), or the one we sent. */
  traceId: string;
  /** True when the server answered with X-WizeLens-Trace, so the dashboard has data for it. */
  profiled: boolean;
  startMs: number;
  error: string | null;
  /** True when this row came from the server after a page load, not from a live fetch. */
  restored?: boolean;
  /** What the server did for this request. Set a moment after the response, for profiled requests. */
  server?: ServerStats;
}

export interface ServerStats {
  /** Name of the first server span, e.g. "GET /api/orders". Null when unknown. */
  name: string | null;
  /** Time the first server span took. Null when unknown. */
  durationMs: number | null;
  dbCount: number;
  /** Wall time with a query running. Queries that run together count once. Null when unknown. */
  dbMs: number | null;
  /** All query times added up. Null when unknown. */
  dbTotalMs: number | null;
  /** Slowest single query. Null when unknown. */
  dbSlowestMs: number | null;
  /** Each query's time, in order. Empty when unknown. */
  dbDurations: number[];
  httpClientCount: number;
  errorCount: number;
  /** Insights: N+1, duplicate, and slow queries. Null when unknown. */
  insights: number | null;
  /** The first server span split in own code, own queries, and outbound calls. Null when unknown. */
  parts: Timing["server"];
  /** Services that took part, without "browser". */
  services: string[];
}

export interface RecorderOptions {
  /** WizeLens base path or URL. Default "/_wizelens". */
  endpoint?: string;
  /** Which requests get a `traceparent` header. Default: same origin only. */
  propagateTo?: (url: URL) => boolean;
  /** How many requests the HUD keeps. Default 30. */
  maxRecent?: number;
  /** How often browser spans are sent. Default 1000 ms. */
  flushIntervalMs?: number;
  /** How long to wait after a response before loading its server stats. Default 400 ms. */
  serverStatsDelayMs?: number;
  /** Capture page views, React renders, and browser errors. Default true. */
  capturePages?: boolean;
  /** Copy `console.log`, `warn`, `error`, `info`, `debug`, and `trace` calls into the page view's trace. Default true. */
  captureConsole?: boolean;
  /** Read traces back from the server, for the HUD. Default true. Off sends only, for a server with its dashboard off. */
  readServer?: boolean;
  /** Your app's version (release), sent as service.version so stacks find the right source maps. Default: what the build plugin set. */
  version?: string;
  /** Read this page's source maps (dev servers serve them) so browser errors group by source. Default true. */
  resolveFrames?: boolean;
  /** Trace `XMLHttpRequest` calls too (Angular's HttpClient, axios). Default true; the React package leaves it off. */
  captureXhr?: boolean;
  /** Render stats and timings from a UI framework. The React package sets this. Default none. */
  framework?: FrameworkHooks;
}

export interface Recorder {
  readonly endpointUrl: string;
  /** Per-tab id. Kept in sessionStorage, so it survives a page refresh. */
  readonly sessionId: string;
  /** Patch `window.fetch` and start page capture. Returns an undo function. Safe to call more than once. */
  install(): () => void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly RecordedRequest[];
  /** Send queued browser spans now. */
  flush(): Promise<void>;
  /** Load this tab's earlier requests from the server. Runs once on install. */
  restore(): Promise<void>;
  /** Load server stats for one trace into its row. Runs on its own for profiled requests. */
  loadServerStats(traceId: string): Promise<void>;
  /** The full trace, when it is already loaded. */
  getTrace(traceId: string): Trace | null;
  /** Load the full (federated) trace. Null when the server has no data for it. */
  loadTrace(traceId: string): Promise<Trace | null>;
  /** Link to the dashboard page for one trace. `view` opens one part of it, for example "sql". */
  traceLink(traceId: string, view?: TraceView): string;
  /** Start a route-change page view for `url` (default: the current location). Needs page capture and `install()`. */
  pageView(url?: string): void;
  /** Send an error in the current page view's trace. Needs page capture and `install()`. */
  captureError(error: unknown, attributes?: Attributes): void;
  clear(): void;
}
