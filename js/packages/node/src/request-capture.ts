import type { IncomingMessage, ServerResponse } from "node:http";
import type { TLSSocket } from "node:tls";
import { type Context, context, ROOT_CONTEXT, type Span as OtelSpan, SpanKind, SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";
import { suppressTracing, type W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  ATTR_EXPECTED,
  ATTR_REQUEST_ABORTED,
  ATTR_REQUEST_ID,
  ATTR_RESPONSE_BODY,
  ATTR_RESPONSE_BODY_TRUNCATED,
  ATTR_STREAM,
  ATTR_STREAM_FIRST_BYTE_MS,
  HEADER_ENDPOINT,
  HEADER_EXPECTED,
  HEADER_TRACE,
  isStreamContentType,
  RESPONSE_HEADER_PREFIX,
  serverTimingValue,
} from "@wizeworks/lens-core";
import { type ResponseTap, tapResponse } from "./body-capture.js";
import { keepExposeHeaders } from "./expose-headers.js";
import { injectHud } from "./hud-inject.js";
import { firstHeader, sendJson } from "./http-util.js";
import { headerAttributes, requestAttributes } from "./request-attributes.js";
import { namedRoute } from "./request-naming.js";
import { isMarkedExpected, SERVER_SPAN } from "./spans.js";

const REQ_SPAN = Symbol.for("wizeworks.wizelens.span");

export interface CaptureDeps {
  tracer: Tracer;
  basePath: string;
  publicEndpoint: string | undefined;
  selfEndpoints: Set<string>;
  w3c: W3CTraceContextPropagator;
  captureResponseBody: boolean;
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  /** The HUD script tag for full HTML pages, or null when the HUD or the dashboard is off. */
  hudTag: string | null;
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

/** A CORS preflight. The browser sends it before a cross-origin call, with no traceparent, so it is not traced. */
export const isPreflight = (req: IncomingMessage): boolean => req.method === "OPTIONS" && req.headers["access-control-request-method"] !== undefined;

// Kubernetes probes, Google and AWS load balancer checks, and Google uptime checks: 200 traces an hour that hid every visit.
const PROBE_AGENTS = ["kube-probe/", "GoogleHC/", "ELB-HealthChecker/", "GoogleStackdriverMonitoring-UptimeChecks"];

/** True for a health check from the platform, not a visitor. */
export function isHealthProbe(req: IncomingMessage): boolean {
  const agent = req.headers["user-agent"];
  return typeof agent === "string" && PROBE_AGENTS.some((p) => agent.startsWith(p));
}

/** True for a request WizeLens does not trace: a CORS preflight, or a health check. */
export const isUntraced = (req: IncomingMessage): boolean => isPreflight(req) || isHealthProbe(req);

/** Run an untraced request with tracing off. Otherwise Next.js and the database adapters still start spans, each its own trace. */
export const withoutTracing = <T>(fn: () => T): T => context.with(suppressTracing(context.active()), fn);

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

/** The app answered with `X-WizeLens-Expected` set to anything but empty, "0", "false", or "no". */
function isExpectedHeader(value: unknown): boolean {
  const v = (Array.isArray(value) ? value[0] : value)?.toString().trim().toLowerCase();
  return !!v && v !== "0" && v !== "false" && v !== "no";
}

/** A stream answer (server-sent events, an upgrade): marks it and its first byte, and tells whether it was one. */
function markStream(span: OtelSpan, res: ServerResponse, tap: ResponseTap, startedAt: number): boolean {
  if (!isStreamContentType(res.getHeader("content-type")) && res.statusCode !== 101) return false;
  span.setAttribute(ATTR_STREAM, true);
  const first = tap.firstAt();
  if (first !== undefined) span.setAttribute(ATTR_STREAM_FIRST_BYTE_MS, Math.round((first - startedAt) * 10) / 10);
  return true;
}

function finishSpan(span: OtelSpan, res: ServerResponse, tap: ResponseTap, method: string, routeOf: RouteOf, startedAt: number): void {
  const stream = markStream(span, res, tap, startedAt);
  // A close before any status was sent: the client left with no answer. Once a status is out, it is the answer; a stream ends early on purpose.
  if (!res.writableFinished && !res.headersSent && !stream) span.setAttribute(ATTR_REQUEST_ABORTED, true);
  if (res.headersSent) span.setAttribute("http.response.status_code", res.statusCode);
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
  const expected = isMarkedExpected(span) || isExpectedHeader(res.getHeader(HEADER_EXPECTED));
  if (expected) span.setAttribute(ATTR_EXPECTED, true);
  if (res.statusCode >= 500 && !expected) span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${res.statusCode}` });
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
  // A page cannot read its own document headers, but it can read Server-Timing. The page load joins this trace with it.
  res.appendHeader("Server-Timing", serverTimingValue(span.spanContext().traceId, endpoint, Date.now()));
  keepExposeHeaders(res);
  (req as unknown as Record<symbol, OtelSpan>)[REQ_SPAN] = span;
  if (d.hudTag && !isOwnPath(d, pathOf(rawUrl))) injectHud(req, res, d.hudTag);
  const tap = tapResponse(res, d.captureResponseBody);
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    finishSpan(span, res, tap, method, () => namedRoute(span, routeOf(), pathOf(rawUrl)), startedAt);
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
