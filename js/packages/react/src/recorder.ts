import { createCaptureHandle, startBrowserCapture } from "./capture.js";
import { type FetchContext, patchFetch } from "./fetch-patch.js";
import type { Recorder, RecorderOptions } from "./recorder-types.js";
import { createInstaller, createRequestStore } from "./request-store.js";
import { createSender } from "./sender.js";
import { ServerData } from "./server-data.js";
import { documentTrace } from "./server-timing.js";
import { getSessionId } from "./session.js";

export type { RecordedRequest, Recorder, RecorderOptions, ServerStats } from "./recorder-types.js";
export { mergeRequests, serverStatsFromTrace, summaryToRequest } from "./requests.js";
export { getSessionId } from "./session.js";

function resolveOptions(options: RecorderOptions) {
  const base = typeof location !== "undefined" ? location.href : "http://localhost/";
  const endpoint = new URL((options.endpoint ?? "/_wizelens").replace(/\/+$/, "") + "/", base);
  return {
    base,
    endpoint,
    endpointUrl: endpoint.href.replace(/\/$/, ""),
    maxRecent: options.maxRecent ?? 30,
    flushIntervalMs: options.flushIntervalMs ?? 1000,
    statsDelayMs: options.serverStatsDelayMs ?? 400,
    propagateTo: options.propagateTo ?? ((u: URL) => u.origin === new URL(base).origin),
    capturePages: options.capturePages ?? true,
    captureConsole: options.captureConsole ?? true,
    sessionId: getSessionId(),
  };
}

// The server that rendered this page holds the page-load trace: its spans go there.
function noteDocument(data: ServerData, endpointUrl: string): void {
  const doc = documentTrace();
  if (doc?.endpoint && doc.endpoint !== endpointUrl) data.noteEndpoint(doc.traceId, doc.endpoint);
}

export function createRecorder(options: RecorderOptions = {}): Recorder {
  const cfg = resolveOptions(options);
  const store = createRequestStore(cfg.maxRecent);
  let original: typeof fetch | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const data = new ServerData({ ...cfg, store, getFetch: () => original ?? globalThis.fetch });
  const sender = createSender(cfg.endpointUrl, () => original, (id) => data.endpointOf(id));
  const noteEndpoint = (id: string, endpoint: string) => data.noteEndpoint(id, endpoint);
  const ctx: FetchContext = { ...cfg, store, sender, noteEndpoint, loadServerStats: (id) => data.loadServerStats(id) };
  const capture = createCaptureHandle(() => (cfg.capturePages ? startBrowserCapture({ sender, sessionId: cfg.sessionId, captureConsole: cfg.captureConsole }) : () => {}));
  // Send queued spans before the page goes away, so a refresh does not lose them.
  const onPageHide = () => void sender.flush();
  const install = createInstaller({
    start() {
      noteDocument(data, cfg.endpointUrl);
      original = globalThis.fetch;
      globalThis.fetch = patchFetch(original, ctx);
      timer = setInterval(() => void sender.flush(false), cfg.flushIntervalMs);
      if (typeof addEventListener === "function") addEventListener("pagehide", onPageHide);
      capture.acquire();
      void data.restore();
    },
    stop() {
      capture.release();
      void sender.flush();
      if (original) globalThis.fetch = original;
      if (timer) clearInterval(timer);
      timer = null;
      if (typeof removeEventListener === "function") removeEventListener("pagehide", onPageHide);
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
    getTrace: (traceId) => data.getTrace(traceId),
    loadTrace: (traceId) => data.loadTrace(traceId),
    traceLink: (id, view) => `${data.endpointOf(id)}/#/traces/${id}${view ? `/${view}` : ""}`,
    clear: store.clear,
  };
}
