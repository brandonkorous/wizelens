import { subscribe, unsubscribe } from "node:diagnostics_channel";
import type { ClientRequest, IncomingMessage } from "node:http";
import { type Context, context, isSpanContextValid, type Span as OtelSpan, propagation, SpanKind, trace, type Tracer } from "@opentelemetry/api";
import { isTracingSuppressed } from "@opentelemetry/core";
import { HEADER_ENDPOINT, HEADER_HOP } from "@wizeworks/lens-core";
import { clientMethod, clientRequestAttributes, clientSpanName, isAbort, type OnRemote, setClientError, setClientStatus } from "./client-attributes.js";

// Node publishes these for every ClientRequest: http.request, http.get, https.*, and new ClientRequest through any Agent.
const CREATED = "http.client.request.created";
const START = "http.client.request.start";
const RESPONSE = "http.client.response.finish";
const ERROR = "http.client.request.error";

const ABSOLUTE = /^https?:\/\//i;

interface Call {
  span: OtelSpan;
  failed: boolean;
}

type Message = { request: ClientRequest; response?: IncomingMessage; error?: unknown };

/** The port in a Host header, when it names the host the request connects to. */
function portIn(header: unknown, host: string): string | undefined {
  if (typeof header !== "string") return undefined;
  try {
    const url = new URL(`http://${header}`);
    return url.hostname.replace(/^\[|\]$/g, "").toLowerCase() === host.toLowerCase() ? url.port : undefined;
  } catch {
    return undefined;
  }
}

/** The URL a request goes to, without user name or password. A proxied request carries its full URL as the path. */
export function urlOf(req: ClientRequest): URL | undefined {
  try {
    const host = req.host.includes(":") && !req.host.startsWith("[") ? `[${req.host}]` : req.host;
    const port = portIn(req.getHeader("host"), req.host);
    const url = ABSOLUTE.test(req.path) ? new URL(req.path) : new URL(req.path, `${req.protocol}//${host}${port ? `:${port}` : ""}`);
    url.username = "";
    url.password = "";
    return url;
  } catch {
    return undefined;
  }
}

/** Calls inside a request only, never with tracing off (WizeLens's own calls), never federation hops. */
function shouldTrace(ctx: Context, req: ClientRequest): boolean {
  const parent = trace.getSpanContext(ctx);
  if (isTracingSuppressed(ctx) || !parent || !isSpanContextValid(parent)) return false;
  return req.method !== "CONNECT" && req.getHeader(HEADER_HOP) === undefined;
}

/** Write traceparent while the headers can still change. Array headers are already written, so they go without it. */
function inject(req: ClientRequest, ctx: Context): void {
  if (req.headersSent) return;
  try {
    propagation.inject(ctx, req, { set: (carrier, key, value) => carrier.setHeader(key, value) });
  } catch {
    // The headers were sent in between: trace without propagation.
  }
}

function startCall(tracer: Tracer, req: ClientRequest, propagate: boolean): Call | null {
  const ctx = context.active();
  const url = shouldTrace(ctx, req) ? urlOf(req) : undefined;
  if (!url) return null;
  const agent = req.getHeader("user-agent");
  const attributes = clientRequestAttributes(req.method, url, typeof agent === "string" ? agent : undefined);
  const span = tracer.startSpan(clientSpanName(clientMethod(req.method)), { kind: SpanKind.CLIENT, attributes }, ctx);
  if (propagate) inject(req, trace.setSpan(ctx, span));
  return { span, failed: false };
}

function setPeer(span: OtelSpan, req: ClientRequest, version?: string): void {
  const socket = req.socket;
  if (socket?.remoteAddress) span.setAttribute("network.peer.address", socket.remoteAddress);
  if (socket?.remotePort) span.setAttribute("network.peer.port", socket.remotePort);
  span.setAttribute("network.protocol.version", version || "1.1");
}

function onResponse(call: Call, req: ClientRequest, res: IncomingMessage, onRemote: OnRemote): void {
  setPeer(call.span, req, res.httpVersion);
  setClientStatus(call.span, res.statusCode ?? 0);
  const endpoint = res.headers[HEADER_ENDPOINT.toLowerCase()];
  if (typeof endpoint === "string" && endpoint) onRemote(call.span.spanContext().traceId, endpoint);
}

function onError(call: Call, req: ClientRequest, error: unknown): void {
  if (call.failed || isAbort(error)) return;
  call.failed = true;
  setPeer(call.span, req);
  setClientError(call.span, error);
}

/** The request closed: after the whole body, an error, or an abort. A body cut off by the server is an error. */
function finish(call: Call, req: ClientRequest): void {
  const cut = (req as ClientRequest & { res?: IncomingMessage | null }).res?.errored;
  if (cut && !req.aborted) onError(call, req, cut);
  call.span.end();
}

/** Trace outgoing node:http and node:https calls made inside a request, as fetch calls are. Returns the stop function. */
export function instrumentHttp(tracer: Tracer, onRemote: OnRemote): () => void {
  const calls = new WeakMap<ClientRequest, Call | null>();
  const begin = (propagate: boolean) => ({ request }: Message) => {
    if (calls.has(request)) return;
    const call = startCall(tracer, request, propagate);
    calls.set(request, call);
    if (call) request.once("close", () => finish(call, request));
  };
  const handlers: Record<string, (message: unknown) => void> = {
    [CREATED]: begin(true) as (m: unknown) => void,
    // Only when Node has no created channel: the headers are written by now, so no traceparent.
    [START]: begin(false) as (m: unknown) => void,
    [RESPONSE]: (m) => {
      const { request, response } = m as Message;
      const call = calls.get(request);
      if (call && response) onResponse(call, request, response, onRemote);
    },
    [ERROR]: (m) => {
      const { request, error } = m as Message;
      const call = calls.get(request);
      if (call) onError(call, request, error);
    },
  };
  for (const [name, fn] of Object.entries(handlers)) subscribe(name, fn);
  return () => {
    for (const [name, fn] of Object.entries(handlers)) unsubscribe(name, fn);
  };
}
