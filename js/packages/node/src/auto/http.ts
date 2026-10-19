import { type IncomingMessage, Server as HttpServer, type ServerResponse } from "node:http";
import { Server as HttpsServer } from "node:https";
import { context, type Span as OtelSpan } from "@opentelemetry/api";
import { patchMethod } from "../adapters/registry.js";
import { expressRoute } from "../capture.js";
import { attributeOf, type IgnorePath } from "../frameworks/node-server.js";
import { captureRequest, isOwnPath, isUntraced, pathOf, requestSpan, serveOwnPath, withoutTracing } from "../request-capture.js";
import { watchRoute } from "../route-timing.js";
import { recordOn } from "../spans.js";
import type { Req } from "../types.js";
import { currentOwner, type Owner } from "./owner.js";

const ROUTE_OF = Symbol.for("wizeworks.wizelens.auto.route");
const RECORDED = Symbol.for("wizeworks.wizelens.auto.recorded");
const STARTED = Symbol.for("wizeworks.wizelens.auto.started");

type Marked = IncomingMessage & { [ROUTE_OF]?: () => string | undefined; [RECORDED]?: unknown; [STARTED]?: number };

/** When the auto install started this request, in performance.now() time. */
export const startedAtOf = (req: IncomingMessage): number | undefined => (req as Marked)[STARTED];

/** How a framework names the route of this request ("/orders/:id"), read when the response is done. */
export const setRouteOf = (req: IncomingMessage, fn: () => string | undefined): void => void ((req as Marked)[ROUTE_OF] = fn);

/** Put a framework's error on the request span, once, when the auto install owns the request. */
export function recordRequestError(req: IncomingMessage, err: unknown): void {
  const span = requestSpan(req);
  const marked = req as Marked;
  if (!span || err === undefined || marked[RECORDED] === err || currentOwner()?.auto !== true) return;
  marked[RECORDED] = err;
  recordOn(span, err);
}

const settings = { ignore: (() => false) as IgnorePath, express: false, firstRequest: null as ((owner: Owner) => void) | null };

/** Skip these paths, for example the Next.js build files. */
export const ignorePaths = (ignore: IgnorePath): void => void (settings.ignore = ignore);

/** Express is loaded: watch `req.route` for the routing time. */
export const watchExpressRoutes = (): void => void (settings.express = true);

/** Run `fn` once, before the first request the auto install captures. */
export const beforeFirstRequest = (fn: (owner: Owner) => void): void => void (settings.firstRequest = fn);

function routeOf(req: Marked, span: () => OtelSpan): () => string | undefined {
  return () => attributeOf(span(), "http.route") ?? expressRoute(req as Req) ?? req[ROUTE_OF]?.();
}

function capture(owner: Owner, req: IncomingMessage, res: ServerResponse, emit: () => boolean): boolean {
  const d = owner.parts.capture;
  const rawUrl = req.url ?? "/";
  const path = pathOf(rawUrl);
  if (isOwnPath(d, path)) return (void serveOwnPath(d, req, res), true);
  if (isUntraced(req) || settings.ignore(path)) return withoutTracing(emit);
  const captured = captureRequest(d, req, res, rawUrl, routeOf(req as Marked, () => captured.span));
  (req as Marked)[STARTED] = captured.startedAt;
  if (settings.express) watchRoute(req, "route", captured.span, captured.startedAt);
  return context.with(captured.ctx, emit);
}

function onRequest(req: IncomingMessage, res: ServerResponse, emit: () => boolean): boolean {
  if (requestSpan(req)) return emit();
  const owner = currentOwner();
  if (!owner?.auto) return emit();
  const first = settings.firstRequest;
  settings.firstRequest = null;
  first?.(owner);
  return capture(owner, req, res, emit);
}

/** Trace every request of every node:http and node:https server, and start WizeLens when a server starts listening. */
export function hookServers(): void {
  for (const proto of [HttpServer.prototype, HttpsServer.prototype]) {
    patchMethod(
      proto,
      "emit",
      (emit) =>
        function wizelensAutoEmit(this: unknown, ...args: unknown[]) {
          const [event, req, res] = args;
          if (event !== "request") return emit.apply(this, args);
          return onRequest(req as IncomingMessage, res as ServerResponse, () => emit.apply(this, args) as boolean);
        },
      "auto-server-emit",
    );
    patchMethod(
      proto,
      "listen",
      (listen) =>
        function wizelensAutoListen(this: unknown, ...args: unknown[]) {
          currentOwner();
          return listen.apply(this, args);
        },
      "auto-server-listen",
    );
  }
}
