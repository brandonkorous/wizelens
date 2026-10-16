import type { IncomingMessage, ServerResponse } from "node:http";
import type { TLSSocket } from "node:tls";
import { type Context, context, ROOT_CONTEXT, type Span as OtelSpan, SpanKind, SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";
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
import { SERVER_SPAN } from "./spans.js";

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

/** One captured request: its server span and the context that makes it the parent of everything inside. */
export interface CapturedRequest {
  span: OtelSpan;
  ctx: Context;
  startedAt: number;
}

/** The route template ("/orders/:id"), read when the response is done. Undefined when unknown. */
export type RouteOf = () => string | undefined;

function endpointFor(req: IncomingMessage, d: CaptureDeps): string {
  if (d.publicEndpoint) return d.publicEndpoint;
  const proto = firstHeader(req.headers["x-forwarded-proto"]) ?? ((req.socket as TLSSocket).encrypted ? "https" : "http");
  const host = firstHeader(req.headers["x-forwarded-host"]) ?? req.headers.host ?? "localhost";
  return `${proto}://${host}${d.basePath}`;
}

/** Path of a raw url without the query. */
export const pathOf = (rawUrl: string): string => rawUrl.split("?")[0] ?? "/";

export const isOwnPath = (d: CaptureDeps, path: string): boolean => path === d.basePath || path.startsWith(d.basePath + "/");

/** Serve the dashboard and API. Resolves when the response is written. */
export function serveOwnPath(d: CaptureDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  return d.handler(req, res).then(
    () => undefined,
    (err) => {
      if (!res.headersSent) sendJson(res, 500, { error: String(err) });
      else res.end();
    },
  );
}

function finishSpan(span: OtelSpan, res: ServerResponse, tap: ResponseTap, method: string, routeOf: RouteOf): void {
  span.setAttribute("http.response.status_code", res.statusCode);
  const route = routeOf();
  if (route) {
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

function startSpan(d: CaptureDeps, req: IncomingMessage, rawUrl: string) {
  const method = req.method ?? "GET";
  const parentCtx = d.w3c.extract(ROOT_CONTEXT, req.headers, {
    get: (carrier, key) => carrier[key],
    keys: (carrier) => Object.keys(carrier),
  });
  const attributes = requestAttributes(req, method, pathOf(rawUrl), rawUrl);
  const span = d.tracer.startSpan(`${method} ${pathOf(rawUrl)}`, { kind: SpanKind.SERVER, attributes }, parentCtx);
  span.setAttribute(ATTR_REQUEST_ID, firstHeader(req.headers["x-request-id"]) ?? span.spanContext().spanId);
  return { span, method, ctx: trace.setSpan(parentCtx, span).setValue(SERVER_SPAN, span) };
}

/** Start the server span of one request on the raw Node objects. Works for any framework that runs on node:http. */
export function captureRequest(d: CaptureDeps, req: IncomingMessage, res: ServerResponse, rawUrl: string, routeOf: RouteOf): CapturedRequest {
  const startedAt = performance.now();
  const { span, method, ctx } = startSpan(d, req, rawUrl);
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
    finishSpan(span, res, tap, method, routeOf);
  };
  res.once("finish", finish);
  res.once("close", finish);
  // Body and response events run in the request's context, so work in their listeners joins this trace.
  context.bind(ctx, req);
  context.bind(ctx, res);
  return { span, ctx, startedAt };
}

/** The server span WizeLens started for this request, if any. */
export function requestSpan(req: IncomingMessage): OtelSpan | undefined {
  return (req as unknown as Record<symbol, OtelSpan | undefined>)[REQ_SPAN];
}
