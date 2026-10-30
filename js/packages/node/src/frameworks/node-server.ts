import { type IncomingMessage, Server as HttpServer, type ServerResponse } from "node:http";
import { Server as HttpsServer } from "node:https";
import { context, type Span as OtelSpan } from "@opentelemetry/api";
import { pathShape } from "@wizeworks/lens-core/internal";
import { patchMethod } from "../adapters/registry.js";
import { type CaptureDeps, captureRequest, isOwnPath, isUntraced, pathOf, requestSpan, serveOwnPath, withoutTracing } from "../request-capture.js";

/** True for a path that is not traced, for example a static file. */
export type IgnorePath = (path: string) => boolean;

/** A string attribute of a live SDK span. The OTel API has no getter, so this reads the SDK field. */
export function attributeOf(span: OtelSpan, key: string): string | undefined {
  const value = (span as unknown as { attributes?: Record<string, unknown> }).attributes?.[key];
  return typeof value === "string" ? value : undefined;
}

const asPath = (v: string | undefined): string | undefined => (v?.startsWith("/") ? v : undefined);

/** The route the framework set on the span, when it is a path. Next.js middleware sets "middleware GET": then next.route, else the path's shape. */
export function frameworkRoute(span: OtelSpan, path: string): string | undefined {
  const route = attributeOf(span, "http.route");
  const named = asPath(route) ?? asPath(attributeOf(span, "next.route"));
  return named ?? (route ? pathShape(path) : undefined);
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
  const captured = captureRequest(d, req, res, rawUrl, () => frameworkRoute(captured.span, path));
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
