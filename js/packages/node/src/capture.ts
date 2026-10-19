import type { IncomingMessage, ServerResponse } from "node:http";
import { context } from "@opentelemetry/api";
import { captureRequest, type CaptureDeps, isOwnPath, isUntraced, pathOf, serveOwnPath, withoutTracing } from "./request-capture.js";
import { watchRoute } from "./route-timing.js";
import { recordOn } from "./spans.js";
import type { Next, Req } from "./types.js";

export type { CaptureDeps } from "./request-capture.js";
export { requestSpan } from "./request-capture.js";

/** Express route template, including the mount path of nested routers. */
export function expressRoute(req: Req): string | undefined {
  const routePath = req.route?.path;
  return typeof routePath === "string" ? `${req.baseUrl ?? ""}${routePath}` : undefined;
}

/** Express / Connect middleware: one server span per request, plus the WizeLens routes. */
export function createMiddleware(d: CaptureDeps) {
  return function middleware(req: IncomingMessage, res: ServerResponse, next: Next): void {
    const r = req as Req;
    const rawUrl = r.originalUrl ?? r.url ?? "/";
    if (isOwnPath(d, pathOf(rawUrl))) return void serveOwnPath(d, req, res);
    if (isUntraced(req)) return withoutTracing(next);
    const { span, ctx, startedAt } = captureRequest(d, req, res, rawUrl, () => expressRoute(r));
    watchRoute(req, "route", span, startedAt);
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
