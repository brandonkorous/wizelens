import { ATTR_BROWSER_RENDER_MS, formatTraceparent, HEADER_TRACE, newSpanId, newTraceId, type Span } from "@wizeworks/lens-core";
import { browserSpan, currentRoute } from "./browser-span.js";
import { afterNextPaint, watchBody } from "./paint.js";
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
}

interface Call {
  url: URL;
  method: string;
  traceId: string;
  spanId: string;
  startMs: number;
  record: RecordedRequest;
}

function requestUrl(input: RequestInfo | URL, base: string): URL {
  if (typeof input === "string") return new URL(input, base);
  if (input instanceof URL) return input;
  return new URL(input.url, base);
}

function isWizeLensCall(url: URL, endpoint: URL): boolean {
  return url.origin === endpoint.origin && (url.pathname + "/").startsWith(endpoint.pathname);
}

function startCall(ctx: FetchContext, url: URL, input: RequestInfo | URL, init?: RequestInit): { call: Call; nextInit?: RequestInit } {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const traceId = newTraceId();
  const spanId = newSpanId();
  let nextInit = init;
  if (ctx.propagateTo(url)) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("traceparent", formatTraceparent(traceId, spanId, true));
    nextInit = { ...init, headers };
  }
  const path = url.origin === new URL(ctx.base).origin ? url.pathname + url.search : url.href;
  const record: RecordedRequest = {
    id: spanId, method, url: url.href, path, status: null, durationMs: null, renderMs: null,
    traceId, profiled: false, startMs: now(), error: null,
  };
  ctx.store.upsert(record);
  return { call: { url, method, traceId, spanId, startMs: record.startMs, record }, nextInit };
}

function fetchSpan(ctx: FetchContext, call: Call, traceId: string, durationMs: number, status: number | null, error: string | null): Span {
  const failed = error ?? (status !== null && status >= 500 ? `HTTP ${status}` : null);
  return browserSpan({
    type: "fetch",
    traceId,
    spanId: call.spanId,
    parentSpanId: null,
    name: `fetch ${call.url.pathname}`,
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
function holdForRender(ctx: FetchContext, span: Span, response: Response, headersAt: number): void {
  ctx.sender.hold(span.spanId, span);
  const send = () => void ctx.sender.release(span.spanId);
  const giveUp = setTimeout(send, RENDER_WAIT_MS);
  watchBody(response, () =>
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

function finishCall(ctx: FetchContext, call: Call, response: Response | null, error: string | null): void {
  const serverTrace = response?.headers.get(HEADER_TRACE) ?? null;
  const status = response?.status ?? null;
  const headersAt = now();
  const durationMs = headersAt - call.startMs;
  const traceId = serverTrace ?? call.traceId;
  ctx.store.upsert({ ...call.record, status, durationMs, renderMs: null, traceId, profiled: !!serverTrace, error });
  // The server ends its span after it sends the response, so wait a moment.
  if (serverTrace) setTimeout(() => void ctx.loadServerStats(serverTrace), ctx.statsDelayMs);
  const span = fetchSpan(ctx, call, traceId, durationMs, status, error);
  if (response) holdForRender(ctx, span, response, headersAt);
  else ctx.sender.push(span);
}

/** A fetch that adds traceparent, records the request for the HUD, and sends a browser span. */
export function patchFetch(orig: typeof fetch, ctx: FetchContext): typeof fetch {
  return async function profiledFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url: URL;
    try {
      url = requestUrl(input, ctx.base);
    } catch {
      return orig(input, init);
    }
    if (isWizeLensCall(url, ctx.endpoint)) return orig(input, init);
    const { call, nextInit } = startCall(ctx, url, input, init);
    try {
      const rewrap = input instanceof Request && nextInit !== init;
      const response = rewrap ? await orig(new Request(input, nextInit)) : await orig(input, nextInit);
      finishCall(ctx, call, response, null);
      return response;
    } catch (err) {
      finishCall(ctx, call, null, err instanceof Error ? err.message : String(err));
      throw err;
    }
  };
}
