import { type BrowserCapture, createBrowserCapture, createCaptureHandle } from "./capture.js";
import { watchLeaving } from "./fetch-failure.js";
import { type FetchContext, patchFetch } from "./fetch-patch.js";
import { isCloudBrowserEndpoint } from "./cloud.js";
import type { Recorder, RecorderOptions } from "./recorder-types.js";
import { documentRequest, whenPainted } from "./document-request.js";
import { type UnseenCall, watchCalls } from "./unseen-calls.js";
import { createInstaller, createRequestStore, type RequestStore } from "./request-store.js";
import { injectedRelease } from "./error-frames.js";
import { createSender, type Sender, spanHome } from "./sender.js";
import { ServerData } from "./server-data.js";
import { documentTrace } from "./server-timing.js";
import { getSessionId } from "./session.js";
import { patchXhr } from "./xhr-patch.js";

export type { RecordedRequest, Recorder, RecorderOptions, ServerStats } from "./recorder-types.js";
export { mergeRequests, serverStatsFromTrace, summaryToRequest } from "./requests.js";
export { getSessionId } from "./session.js";

const pageBase = () => (typeof location !== "undefined" ? location.href : "http://localhost/");

/** The WizeLens base URL for an `endpoint` option (default "/_wizelens"), absolute and without a trailing slash. */
export function endpointUrlOf(endpoint = "/_wizelens"): string {
  return new URL(endpoint.replace(/\/+$/, "") + "/", pageBase()).href.replace(/\/$/, "");
}

function resolveOptions(options: RecorderOptions) {
  const base = pageBase();
  const endpointUrl = endpointUrlOf(options.endpoint);
  return {
    base,
    endpoint: new URL(`${endpointUrl}/`),
    endpointUrl,
    maxRecent: options.maxRecent ?? 30,
    flushIntervalMs: options.flushIntervalMs ?? 1000,
    statsDelayMs: options.serverStatsDelayMs ?? 400,
    propagateTo: options.propagateTo ?? ((u: URL) => u.origin === new URL(base).origin),
    capturePages: options.capturePages ?? true,
    captureConsole: options.captureConsole ?? true,
    captureXhr: options.captureXhr ?? true,
    // A browser key only sends: the cloud reads nothing back to a page.
    readServer: isCloudBrowserEndpoint(endpointUrl) ? false : (options.readServer ?? true),
    version: options.release ?? injectedRelease(),
    resolveFrames: options.resolveFrames ?? true,
    framework: options.framework,
    sessionId: getSessionId(),
  };
}

type Config = ReturnType<typeof resolveOptions>;

// The server that rendered this page holds the page-load trace: its spans go there.
function noteDocument(data: ServerData, endpointUrl: string): void {
  const doc = documentTrace();
  if (doc?.endpoint && doc.endpoint !== endpointUrl) data.noteEndpoint(doc.traceId, doc.endpoint);
}

// The page's own request leads the HUD's list, like Glimpse: its server trace loads a moment later.
function showDocument(store: RequestStore, data: ServerData, delayMs: number): void {
  const doc = documentRequest();
  if (!doc) return;
  store.upsert(doc);
  setTimeout(() => void data.loadServerStats(doc.traceId), delayMs);
  // First paint can land after this runs, when the row counted DOM-ready instead: correct it then.
  whenPainted((renderMs) => store.patch(doc.id, { renderMs }));
}

// A traced call the patches did not see (made before they went on) joins the list from resource timing.
function showUnseen(store: RequestStore, data: ServerData, cfg: Config): () => void {
  return watchCalls(cfg.endpoint, cfg.base, cfg.captureXhr, ({ row, endpoint }: UnseenCall) => {
    if (store.get().some((r) => r.traceId === row.traceId && !r.restored)) return;
    if (endpoint && endpoint !== cfg.endpointUrl) data.noteEndpoint(row.traceId, endpoint);
    store.upsert(row);
    setTimeout(() => void data.loadServerStats(row.traceId), cfg.statsDelayMs);
  });
}

// Send queued spans before the page goes away, so a refresh does not lose them.
function flushOnHide(sender: Sender): () => void {
  if (typeof addEventListener !== "function") return () => {};
  const onPageHide = () => void sender.flush();
  addEventListener("pagehide", onPageHide);
  return () => removeEventListener("pagehide", onPageHide);
}

/** Page capture that the recorder can reach while it runs, for `pageView` and `captureError`. */
function pageCapture(cfg: Config, sender: Sender) {
  let live: BrowserCapture | null = null;
  const handle = createCaptureHandle(() => {
    if (!cfg.capturePages) return () => {};
    const capture = createBrowserCapture({ sender, sessionId: cfg.sessionId, captureConsole: cfg.captureConsole, resolveFrames: cfg.resolveFrames, framework: cfg.framework });
    live = capture;
    return () => {
      capture.stop();
      if (live === capture) live = null;
    };
  });
  return { ...handle, current: () => live };
}

export function createRecorder(options: RecorderOptions = {}): Recorder {
  const cfg = resolveOptions(options);
  const store = createRequestStore(cfg.maxRecent);
  let original: typeof fetch | null = null;
  let undo: (() => void)[] = [];
  const data = new ServerData({ ...cfg, store, getFetch: () => original ?? globalThis.fetch });
  const sender = createSender(cfg.endpointUrl, () => original, (id) => data.endpointOf(id), cfg.version);
  const noteEndpoint = (id: string, endpoint: string) => data.noteEndpoint(id, endpoint);
  const ctx: FetchContext = { ...cfg, store, sender, noteEndpoint, loadServerStats: (id) => data.loadServerStats(id) };
  const capture = pageCapture(cfg, sender);
  const install = createInstaller({
    start() {
      noteDocument(data, cfg.endpointUrl);
      showDocument(store, data, cfg.statsDelayMs);
      original = globalThis.fetch;
      globalThis.fetch = patchFetch(original, ctx);
      const timer = setInterval(() => void sender.flush(false), cfg.flushIntervalMs);
      undo = [cfg.captureXhr ? patchXhr(ctx) : () => {}, showUnseen(store, data, cfg), () => clearInterval(timer), flushOnHide(sender), watchLeaving()];
      capture.acquire();
      void data.restore();
    },
    stop() {
      capture.release();
      void sender.flush();
      if (original) globalThis.fetch = original;
      undo.forEach((u) => u());
      undo = [];
    },
  });
  return {
    endpointUrl: cfg.endpointUrl,
    sessionId: cfg.sessionId,
    install,
    subscribe: store.subscribe,
    getSnapshot: store.get,
    flush: () => sender.flush(),
    restore: () => data.restore(),
    loadServerStats: (traceId) => data.loadServerStats(traceId),
    getServerStats: (traceId) => data.getServerStats(traceId),
    getTrace: (traceId) => data.getTrace(traceId),
    loadTrace: (traceId) => data.loadTrace(traceId),
    traceLink: (id, view) => `${spanHome(data.endpointOf(id), cfg.endpointUrl)}/#/traces/${id}${view ? `/${view}` : ""}`,
    pageView: (url) => capture.current()?.pageView(url),
    captureError: (error, attributes) => capture.current()?.captureError(error, attributes),
    clear: store.clear,
  };
}
