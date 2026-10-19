import { type IncomingMessage, Server as HttpServer, type ServerResponse } from "node:http";
import { Server as HttpsServer } from "node:https";
import { context, type Span as OtelSpan } from "@opentelemetry/api";
import { patchMethod } from "../adapters/registry.js";
import { type CaptureDeps, captureRequest, isOwnPath, isUntraced, pathOf, requestSpan, serveOwnPath, withoutTracing } from "../request-capture.js";

/** True for a path that is not traced, for example a static file. */
export type IgnorePath = (path: string) => boolean;

/** A string attribute of a live SDK span. The OTel API has no getter, so this reads the SDK field. */
export function attributeOf(span: OtelSpan, key: string): string | undefined {
  const value = (span as unknown as { attributes?: Record<string, unknown> }).attributes?.[key];
  return typeof value === "string" ? value : undefined;
}

function onRequest(d: CaptureDeps, ignore: IgnorePath, req: IncomingMessage, res: ServerResponse, emit: () => boolean): boolean {
  const rawUrl = req.url ?? "/";
  const path = pathOf(rawUrl);
  if (isOwnPath(d, path)) {
    void serveOwnPath(d, req, res);
    return true;
  }
  if (requestSpan(req)) return emit();
  if (isUntraced(req) || ignore(path)) return withoutTracing(emit);
  // The framework names the route on this span: Next.js sets http.route on the span around its own.
  const captured = captureRequest(d, req, res, rawUrl, () => attributeOf(captured.span, "http.route"));
  return context.with(captured.ctx, emit);
}

/** Trace each request of every node:http and node:https server in this process. For frameworks with no middleware hook, such as Next.js. */
export function traceServers(d: CaptureDeps, ignore: IgnorePath): void {
  for (const proto of [HttpServer.prototype, HttpsServer.prototype]) {
    patchMethod(
      proto,
      "emit",
      (emit) =>
        function wizelensEmit(this: unknown, ...args: unknown[]) {
          const [event, req, res] = args;
          if (event !== "request") return emit.apply(this, args);
          return onRequest(d, ignore, req as IncomingMessage, res as ServerResponse, () => emit.apply(this, args) as boolean);
        },
      "server-emit",
    );
  }
}
