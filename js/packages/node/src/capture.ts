import type { IncomingMessage, ServerResponse } from "node:http";
import type { TLSSocket } from "node:tls";
import { context, ROOT_CONTEXT, type Span as OtelSpan, SpanKind, SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";
import type { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  ATTR_REQUEST_ID,
  ATTR_RESPONSE_BODY,
  ATTR_RESPONSE_BODY_TRUNCATED,
  HEADER_ENDPOINT,
  HEADER_TRACE,
  RESPONSE_HEADER_PREFIX,
} from "@wizeworks/lens-core";
import { type ResponseTap, tapResponse } from "./body-capture.js";
import { appendExposeHeaders, firstHeader, sendJson } from "./http-util.js";
import { headerAttributes, requestAttributes } from "./request-attributes.js";
import { watchRoute } from "./route-timing.js";
import { recordOn, SERVER_SPAN } from "./spans.js";
import type { Next, Req } from "./types.js";

const REQ_SPAN = Symbol.for("wizeworks.wizelens.span");

export interface CaptureDeps {
  tracer: Tracer;
  basePath: string;
  publicEndpoint: string | undefined;
  selfEndpoints: Set<string>;
  w3c: W3CTraceContextPropagator;
  captureResponseBody: boolean;
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
}

function endpointFor(req: IncomingMessage, d: CaptureDeps): string {
  if (d.publicEndpoint) return d.publicEndpoint;
  const proto = firstHeader(req.headers["x-forwarded-proto"]) ?? ((req.socket as TLSSocket).encrypted ? "https" : "http");
  const host = firstHeader(req.headers["x-forwarded-host"]) ?? req.headers.host ?? "localhost";
  return `${proto}://${host}${d.basePath}`;
}

function serveOwnPath(d: CaptureDeps, req: IncomingMessage, res: ServerResponse): void {
  d.handler(req, res).catch((err) => {
    if (!res.headersSent) sendJson(res, 500, { error: String(err) });
    else res.end();
  });
}

function finishSpan(span: OtelSpan, req: Req, res: ServerResponse, tap: ResponseTap, method: string): void {
  span.setAttribute("http.response.status_code", res.statusCode);
  const routePath = req.route?.path;
  if (typeof routePath === "string") {
    const route = `${req.baseUrl ?? ""}${routePath}`;
    span.setAttribute("http.route", route);
    span.updateName(`${method} ${route}`);
  }
  span.setAttributes(headerAttributes(res.getHeaders(), RESPONSE_HEADER_PREFIX));
  span.setAttribute("http.response.body.size", tap.bytes());
  const body = tap.body();
  if (body) {
    span.setAttribute(ATTR_RESPONSE_BODY, body.text);
    span.setAttribute(ATTR_RESPONSE_BODY_TRUNCATED, body.truncated);
  }
  if (res.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${res.statusCode}` });
  span.end();
}

function startSpan(d: CaptureDeps, req: IncomingMessage, rawUrl: string, path: string) {
  const method = req.method ?? "GET";
  const parentCtx = d.w3c.extract(ROOT_CONTEXT, req.headers, {
    get: (carrier, key) => carrier[key],
    keys: (carrier) => Object.keys(carrier),
  });
  const attributes = requestAttributes(req, method, path, rawUrl);
  const span = d.tracer.startSpan(`${method} ${path}`, { kind: SpanKind.SERVER, attributes }, parentCtx);
  span.setAttribute(ATTR_REQUEST_ID, firstHeader(req.headers["x-request-id"]) ?? span.spanContext().spanId);
  return { span, method, ctx: trace.setSpan(parentCtx, span).setValue(SERVER_SPAN, span) };
}

/** Express / Connect middleware: one server span per request, plus the WizeLens routes. */
export function createMiddleware(d: CaptureDeps) {
  return function middleware(req: IncomingMessage, res: ServerResponse, next: Next): void {
    const r = req as Req;
    const rawUrl = r.originalUrl ?? r.url ?? "/";
    const path = rawUrl.split("?")[0] ?? "/";
    if (path === d.basePath || path.startsWith(d.basePath + "/")) return serveOwnPath(d, req, res);
    const startedAt = performance.now();
    const { span, method, ctx } = startSpan(d, req, rawUrl, path);
    watchRoute(req, span, startedAt);
    const endpoint = endpointFor(req, d);
    d.selfEndpoints.add(endpoint);
    res.setHeader(HEADER_TRACE, span.spanContext().traceId);
    res.setHeader(HEADER_ENDPOINT, endpoint);
    appendExposeHeaders(res);
    (req as unknown as Record<symbol, OtelSpan>)[REQ_SPAN] = span;
    const tap = tapResponse(res, d.captureResponseBody);
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      finishSpan(span, r, res, tap, method);
    };
    res.once("finish", finish);
    res.once("close", finish);
    context.with(ctx, () => {
      try {
        next();
      } catch (err) {
        recordOn(span, err);
        throw err;
      }
    });
  };
}

/** The server span WizeLens started for this request, if any. */
export function requestSpan(req: IncomingMessage): OtelSpan | undefined {
  return (req as unknown as Record<symbol, OtelSpan | undefined>)[REQ_SPAN];
}
