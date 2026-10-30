import { type Attributes, type Span as OtelSpan, SpanStatusCode } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { ATTR_RPC } from "@wizeworks/lens-core/internal";
import { CATEGORY_ATTR } from "../processor.js";

// gRPC shapes shared by the client and server patches, so the add-on has no dependency on @grpc/grpc-js.

export interface MetadataLike {
  get(key: string): unknown[];
  set(key: string, value: string): void;
}

export interface GrpcModuleLike {
  Channel?: { prototype: object };
  Server?: { prototype: object };
  Metadata?: new () => MetadataLike;
}

/** Trailer key that tells a caller where this service's WizeLens lives, like X-WizeLens-Endpoint on HTTP. */
export const ENDPOINT_KEY = "x-wizelens-endpoint";

export const w3c = new W3CTraceContextPropagator();

export const metadataSetter = { set: (carrier: MetadataLike, key: string, value: string) => carrier.set(key, value) };

export const metadataGetter = {
  get: (carrier: MetadataLike, key: string) => carrier.get(key).map(String),
  keys: () => ["traceparent", "tracestate"],
};

/** "/shop.v1.Items/GetItem" → service "shop.v1.Items", method "GetItem". */
export function splitPath(path: string): { service: string; method: string } {
  const [, service = "unknown", method = path] = /^\/?([^/]+)\/(.+)$/.exec(path) ?? [];
  return { service, method };
}

export function rpcAttributes(path: string, category: "http.client" | "http.server"): Attributes {
  const { service, method } = splitPath(path);
  return {
    [CATEGORY_ATTR]: category,
    [ATTR_RPC.system]: "grpc",
    [ATTR_RPC.service]: service,
    [ATTR_RPC.method]: method,
    "http.request.method": "POST",
  };
}

export const spanNameOf = (path: string): string => {
  const { service, method } = splitPath(path);
  return `${service}/${method}`;
};

/** Record the gRPC status. Any code but OK (0) is an error. */
export function endWithStatus(span: OtelSpan, code: number, details?: string): void {
  span.setAttribute(ATTR_RPC.grpcStatus, code);
  if (code !== 0) span.setStatus({ code: SpanStatusCode.ERROR, message: details || `gRPC status ${code}` });
  span.end();
}

/** "dns:127.0.0.1:50051" or "ipv4:10.0.0.2:1234" → host and port. */
export function hostAndPort(target: string): { host: string; port: number | undefined } {
  const bare = target.replace(/^[a-z0-9]+:(\/\/\/?)?/i, "");
  const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(bare);
  return m ? { host: m[1]!, port: Number(m[2]) } : { host: bare, port: undefined };
}
