import { type Attributes, type Context, context, ROOT_CONTEXT, type Span as OtelSpan, SpanKind, trace, type Tracer } from "@opentelemetry/api";
import { patchMethod } from "../adapters/registry.js";
import { recordOn, SERVER_SPAN } from "../spans.js";
import { ENDPOINT_KEY, endWithStatus, hostAndPort, type MetadataLike, metadataGetter, rpcAttributes, spanNameOf, w3c } from "./shared.js";

interface ServerCallLike {
  metadata?: MetadataLike;
  getPeer?(): string;
  once?(event: string, listener: (arg?: unknown) => void): unknown;
  sendMetadata?(metadata: MetadataLike): void;
  write?(...args: unknown[]): unknown;
}

type Handler = (call: ServerCallLike, callback?: (...a: unknown[]) => unknown) => unknown;

const UNKNOWN = 2;

/** Where to say this service's WizeLens lives, and how to make trailer metadata. */
export interface ServerDiscovery {
  endpoint: () => string | undefined;
  Metadata: (new () => MetadataLike) | undefined;
}

const isMetadata = (m: unknown): m is MetadataLike => typeof (m as MetadataLike | null)?.set === "function";

/** Add the endpoint to the trailers the handler sends (or new ones), so callers can find this service. */
function withEndpoint(trailer: unknown, d: ServerDiscovery): unknown {
  const endpoint = d.endpoint();
  if (!endpoint) return trailer;
  const md = isMetadata(trailer) ? trailer : d.Metadata ? new d.Metadata() : undefined;
  md?.set(ENDPOINT_KEY, endpoint);
  return md ?? trailer;
}

function startServerSpan(tracer: Tracer, path: string, call: ServerCallLike): { span: OtelSpan; ctx: Context } {
  const parent = call.metadata ? w3c.extract(ROOT_CONTEXT, call.metadata, metadataGetter) : ROOT_CONTEXT;
  const attributes: Attributes = { ...rpcAttributes(path, "http.server"), "url.path": path, "http.route": path };
  const peer = call.getPeer?.();
  if (peer) attributes["client.address"] = hostAndPort(peer).host;
  const span = tracer.startSpan(spanNameOf(path), { kind: SpanKind.SERVER, attributes }, parent);
  return { span, ctx: trace.setSpan(parent, span).setValue(SERVER_SPAN, span) };
}

/** Send the endpoint in the response headers too (HTTP/2 callers read headers, not trailers), keeping any headers the handler sends. */
function announceEndpoint(call: ServerCallLike, d: ServerDiscovery): () => void {
  const endpoint = d.endpoint();
  const send = call.sendMetadata?.bind(call);
  if (!endpoint || !send || !d.Metadata) return () => undefined;
  let sent = false;
  call.sendMetadata = (metadata) => {
    sent = true;
    metadata.set(ENDPOINT_KEY, endpoint);
    send(metadata);
  };
  const ensure = () => !sent && call.sendMetadata!(new d.Metadata!());
  const write = call.write?.bind(call);
  if (write) call.write = (...args: unknown[]) => (ensure(), write(...args));
  return ensure;
}

/** Unary and client-stream handlers answer through a callback: its error carries the status code. */
function wrapCallback(span: OtelSpan, callback: (...a: unknown[]) => unknown, d: ServerDiscovery, ensureHeaders: () => void) {
  return (err: unknown, ...rest: unknown[]) => {
    if (!err) ensureHeaders();
    const e = err as { code?: number; details?: string; message?: string; metadata?: unknown } | null;
    if (e) recordOn(span, err);
    endWithStatus(span, e ? (e.code ?? UNKNOWN) : 0, e?.details ?? e?.message);
    if (e && typeof e === "object") e.metadata = withEndpoint(e.metadata, d);
    else rest[1] = withEndpoint(rest[1], d);
    return callback(err, ...rest);
  };
}

/** Streaming handlers end when the stream finishes, or fail with an error. */
function watchStream(span: OtelSpan, call: ServerCallLike): void {
  let done = false;
  const end = (code: number, details?: string) => !done && ((done = true), endWithStatus(span, code, details));
  call.once?.("finish", () => end(0));
  call.once?.("cancelled", () => end(1, "cancelled"));
  call.once?.("error", (err) => {
    const e = err as { code?: number; message?: string };
    end(e?.code ?? UNKNOWN, e?.message);
  });
}

function traceHandler(tracer: Tracer, path: string, type: string, handler: Handler, d: ServerDiscovery): Handler {
  return function (this: unknown, call, callback) {
    const { span, ctx } = startServerSpan(tracer, path, call);
    const ensureHeaders = announceEndpoint(call, d);
    if (typeof callback === "function") callback = wrapCallback(span, callback, d, ensureHeaders);
    else watchStream(span, call);
    if (type !== "unary") context.bind(ctx, call);
    try {
      return context.with(ctx, () => handler.call(this, call, callback));
    } catch (err) {
      recordOn(span, err);
      throw err;
    }
  };
}

/** Trace incoming gRPC calls: a server span per call that continues the caller's trace from the metadata. */
export function patchGrpcServer(proto: object, tracer: Tracer, d: ServerDiscovery): void {
  patchMethod(proto, "register", (original) =>
    function (this: unknown, ...args: unknown[]) {
      const [name, handler, , , type] = args as [string, Handler, unknown, unknown, string];
      if (typeof handler !== "function") return original.apply(this, args);
      return original.apply(this, [name, traceHandler(tracer, name, type, handler, d), ...args.slice(2)]);
    },
  );
}
