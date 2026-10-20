import { type Attributes, type Span as OtelSpan, SpanStatusCode } from "@opentelemetry/api";
import type { TraceStore } from "./store.js";

// The fetch spans come from @opentelemetry/instrumentation-undici. These helpers give the node:http spans the same shape.

const KNOWN_METHODS = new Set(["CONNECT", "OPTIONS", "HEAD", "GET", "POST", "PUT", "PATCH", "DELETE", "TRACE", "QUERY"]);
const DEFAULT_PORTS: Record<string, number> = { http: 80, https: 443 };

/** Called with the trace id and the WizeLens endpoint a called service reported. */
export type OnRemote = (traceId: string, endpoint: string) => void;

/** `http.request.method`: upper case when known, else "_OTHER". */
export const clientMethod = (original: string): string => (KNOWN_METHODS.has(original.toUpperCase()) ? original.toUpperCase() : "_OTHER");

/** The span name before the store renames it to "METHOD host/path". */
export const clientSpanName = (method: string): string => (method === "_OTHER" ? "HTTP" : method);

/** Attributes known when an outgoing call starts. */
export function clientRequestAttributes(originalMethod: string, url: URL, userAgent?: string): Attributes {
  const scheme = url.protocol.replace(":", "");
  const port = Number(url.port || DEFAULT_PORTS[scheme]);
  const attributes: Attributes = {
    "http.request.method": clientMethod(originalMethod),
    "http.request.method_original": originalMethod,
    "url.full": url.toString(),
    "url.path": url.pathname,
    "url.query": url.search,
    "url.scheme": scheme,
    "server.address": url.hostname,
  };
  if (Number.isFinite(port)) attributes["server.port"] = port;
  if (userAgent) attributes["user_agent.original"] = userAgent;
  return attributes;
}

/** The response status. 400 and up is an error with `error.type` set to the status. */
export function setClientStatus(span: OtelSpan, status: number): void {
  span.setAttribute("http.response.status_code", status);
  if (status < 400) return;
  span.setAttribute("error.type", String(status));
  span.setStatus({ code: SpanStatusCode.ERROR });
}

/** True when the caller cancelled the call (an AbortSignal). That is not an error. */
export function isAbort(err: unknown): boolean {
  const e = err as { name?: unknown; code?: unknown } | null;
  return !!e && (e.name === "AbortError" || e.code === "ABORT_ERR" || e.code === 20);
}

/** A failed call: the exception, `error.type` from the error code or name, and an error status. */
export function setClientError(span: OtelSpan, err: unknown): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const code = (error as { code?: unknown }).code;
  span.setAttribute("error.type", typeof code === "string" && code ? code : error.name || "Error");
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
}

/** Keep the WizeLens endpoint a called service reported, so its part of the trace can be federated. */
export function remoteNoter(store: TraceStore, selfEndpoints: ReadonlySet<string>): OnRemote {
  return (traceId, endpoint) => {
    if (endpoint && !selfEndpoints.has(endpoint)) store.addRemote(traceId, endpoint);
  };
}
