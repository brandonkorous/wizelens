import { ATTR_BROWSER_REMOTE, ATTR_BROWSER_RENDER_MS, HEADER_ENDPOINT, HEADER_TRACE, newSpanId, newTraceId, type Span } from "@wizeworks/lens-core";
import { browserSpan, currentRoute } from "./browser-span.js";
import { afterNextPaint } from "./paint.js";
import type { RecordedRequest } from "./recorder-types.js";
import type { RequestStore } from "./request-store.js";
import type { Sender } from "./sender.js";
import { now } from "./session.js";

// A browser span waits at most this long for its render time before it is sent.
const RENDER_WAIT_MS = 2000;

export interface FetchContext {
  base: string;
  endpoint: URL;
  sessionId: string;
  statsDelayMs: number;
  propagateTo(url: URL): boolean;
  store: RequestStore;
  sender: Sender;
  loadServerStats(traceId: string): Promise<void>;
  /** The server that answered holds this trace: the HUD reads it there. */
  noteEndpoint(traceId: string, endpoint: string): void;
}

/** One outgoing request, from `fetch` or `XMLHttpRequest`. */
export interface Call {
  kind: "fetch" | "xhr";
  url: URL;
  method: string;
  traceId: string;
  spanId: string;
  startMs: number;
  record: RecordedRequest;
}

/** What a request span reads from the response. */
export interface Answer {
  status: number;
  header(name: string): string | null;
  /** Call back once the app has read the body. */
  whenRead(onRead: () => void): void;
}

// Any server's WizeLens API, not only this page's endpoint: the HUD and dashboards read other services too.
export function isWizeLensCall(url: URL, endpoint: URL): boolean {
  return (url.pathname + "/").startsWith(endpoint.pathname.replace(/\/*$/, "/"));
}

/** Start a request: give it a trace and a span id, and add its row to the HUD's list. */
export function startCall(ctx: FetchContext, kind: Call["kind"], url: URL, method: string): Call {
  const traceId = newTraceId();
  const spanId = newSpanId();
  const path = url.origin === new URL(ctx.base).origin ? url.pathname + url.search : url.href;
  const record: RecordedRequest = {
    id: spanId, method, url: url.href, path, status: null, durationMs: null, renderMs: null,
    traceId, profiled: false, startMs: now(), error: null,
  };
  ctx.store.upsert(record);
  return { kind, url, method, traceId, spanId, startMs: record.startMs, record };
}

/** The answering server's WizeLens endpoint, when it is not the one this page sends to. */
function remoteOf(ctx: FetchContext, answer: Answer | null): string | null {
  const endpoint = answer?.header(HEADER_ENDPOINT)?.replace(/\/+$/, "");
  return endpoint && endpoint !== ctx.endpoint.href.replace(/\/+$/, "") ? endpoint : null;
}

function requestSpan(ctx: FetchContext, call: Call, traceId: string, durationMs: number, status: number | null, error: string | null): Span {
  const failed = error ?? (status !== null && status >= 500 ? `HTTP ${status}` : null);
  return browserSpan({
    type: "fetch",
    traceId,
    spanId: call.spanId,
    parentSpanId: null,
    name: `${call.kind} ${call.url.pathname}`,
    startMs: call.startMs,
    durationMs,
    sessionId: ctx.sessionId,
    route: currentRoute(),
    error: failed,
    attributes: {
      "url.full": call.url.href,
      "http.request.method": call.method,
      "http.response.status_code": status,
      "wizelens.browser.page": typeof location !== "undefined" ? location.pathname : null,
    },
    events: error ? [{ name: "exception", timeMs: now(), attributes: { "exception.type": "FetchError", "exception.message": error } }] : [],
  });
}

// Holds the span until the app has read the body and the page has painted.
function holdForRender(ctx: FetchContext, span: Span, answer: Answer, headersAt: number): void {
  ctx.sender.hold(span.spanId, span);
  const send = () => void ctx.sender.release(span.spanId);
  const giveUp = setTimeout(send, RENDER_WAIT_MS);
  answer.whenRead(() =>
    void afterNextPaint().then((paintedAt) => {
      if (paintedAt !== null) {
        const renderMs = paintedAt - headersAt;
        span.attributes[ATTR_BROWSER_RENDER_MS] = Math.round(renderMs * 10) / 10;
        ctx.store.patch(span.spanId, { renderMs });
      }
      clearTimeout(giveUp);
      send();
    }),
  );
}

/** End a request: update its HUD row, load its server stats, and send its browser span. `headersAt` defaults to now. */
export function finishCall(ctx: FetchContext, call: Call, answer: Answer | null, error: string | null, headersAt = now()): void {
  const serverTrace = answer?.header(HEADER_TRACE) ?? null;
  const status = answer?.status ?? null;
  const durationMs = headersAt - call.startMs;
  const traceId = serverTrace ?? call.traceId;
  const remote = remoteOf(ctx, answer);
  if (serverTrace && remote) ctx.noteEndpoint(serverTrace, remote);
  ctx.store.upsert({ ...call.record, status, durationMs, renderMs: null, traceId, profiled: !!serverTrace, error });
  // The server ends its span after it sends the response, so wait a moment.
  if (serverTrace) setTimeout(() => void ctx.loadServerStats(serverTrace), ctx.statsDelayMs);
  const span = requestSpan(ctx, call, traceId, durationMs, status, error);
  if (remote) span.attributes[ATTR_BROWSER_REMOTE] = remote;
  if (answer) holdForRender(ctx, span, answer, headersAt);
  else ctx.sender.push(span);
}
