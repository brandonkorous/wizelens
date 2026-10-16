import { type Context, context, type Span as OtelSpan, SpanKind, trace, type Tracer } from "@opentelemetry/api";
import { patchMethod } from "../adapters/registry.js";
import { endWithStatus, hostAndPort, type MetadataLike, metadataSetter, rpcAttributes, spanNameOf, w3c } from "./shared.js";

// Every client call, generated or not, goes through Channel.createCall and then call.start(metadata, listener).

interface ChannelLike {
  getTarget?(): string;
}

interface StatusLike {
  code: number;
  details?: string;
}

interface ListenerLike {
  onReceiveStatus?(status: StatusLike): void;
}

interface CallLike {
  start(metadata: MetadataLike, listener: ListenerLike): void;
}

function startClientSpan(tracer: Tracer, target: string | undefined, path: string): OtelSpan {
  const attributes = rpcAttributes(path, "http.client");
  if (target) {
    const { host, port } = hostAndPort(target);
    attributes["server.address"] = host;
    if (port) attributes["server.port"] = port;
  }
  return tracer.startSpan(spanNameOf(path), { kind: SpanKind.CLIENT, attributes });
}

/** Put traceparent into the metadata, and end the span when the status arrives. */
function traceStart(call: CallLike, span: OtelSpan, ctx: Context): void {
  const start = call.start.bind(call);
  call.start = (metadata, listener) => {
    w3c.inject(ctx, metadata, metadataSetter);
    const wrapped = Object.create(listener) as ListenerLike;
    wrapped.onReceiveStatus = (status) => {
      endWithStatus(span, status.code, status.details);
      listener.onReceiveStatus?.(status);
    };
    start(metadata, wrapped);
  };
}

/** Trace outgoing gRPC calls made inside a request: a client span, traceparent in the metadata, and the final status. */
export function patchGrpcChannel(proto: object, tracer: Tracer): void {
  patchMethod(proto, "createCall", (original) =>
    function (this: ChannelLike, ...args: unknown[]) {
      if (!trace.getSpan(context.active())) return original.apply(this, args);
      const span = startClientSpan(tracer, this.getTarget?.(), String(args[0]));
      const ctx = trace.setSpan(context.active(), span);
      const call = context.with(ctx, () => original.apply(this, args)) as CallLike;
      if (call && typeof call.start === "function") traceStart(call, span, ctx);
      else span.end();
      return call;
    },
  );
}
