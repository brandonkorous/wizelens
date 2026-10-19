import { subscribe } from "node:diagnostics_channel";
import type { IncomingMessage, ServerResponse } from "node:http";
import { trace } from "@opentelemetry/api";
import { patchMethod } from "../adapters/registry.js";
import { keepHeaders } from "../frameworks/koa.js";
import { nextIgnore } from "../frameworks/next.js";
import { preciseProvider } from "../precise.js";
import { requestSpan } from "../request-capture.js";
import { markRouted, watchRoute } from "../route-timing.js";
import { skipped } from "./config.js";
import { hookHono } from "./hono.js";
import { beforeFirstRequest, ignorePaths, recordRequestError, setRouteOf, startedAtOf, watchExpressRoutes } from "./http.js";
import { onLoad } from "./module-hooks.js";
import { currentOwner } from "./owner.js";

type Fn = (...args: unknown[]) => unknown;
type Klass = { prototype: object };

/** Express 4 and 5 (the router package): errors passed to `next(err)`, and the ones nobody handled. */
function hookExpress(): void {
  const layer = (name: string) => (Layer: unknown) => {
    watchExpressRoutes();
    patchMethod((Layer as Klass).prototype, name, (original) =>
      function (this: unknown, err: unknown, req: unknown, ...rest: unknown[]) {
        recordRequestError(req as IncomingMessage, err);
        return original.call(this, err, req, ...rest);
      }, "auto-error");
  };
  onLoad(/\/node_modules\/router\/lib\/layer\.js$/, layer("handleError"));
  onLoad(/\/node_modules\/express\/lib\/router\/layer\.js$/, layer("handle_error"));
  onLoad(/\/node_modules\/finalhandler\/index\.js$/, (finalhandler) => {
    if (typeof finalhandler !== "function") return undefined;
    const wrapped = function (this: unknown, req: IncomingMessage, ...rest: unknown[]) {
      const done = (finalhandler as Fn).call(this, req, ...rest) as Fn;
      return function (this: unknown, err: unknown) {
        if (err) recordRequestError(req, err);
        return done.call(this, err);
      };
    };
    return Object.assign(wrapped, finalhandler);
  });
}

interface KoaContextLike {
  req: IncomingMessage;
  res: ServerResponse;
  _matchedRoute?: unknown;
}

/** Koa: the @koa/router route, and errors (keeping the WizeLens headers Koa would remove). */
function hookKoa(): void {
  onLoad(/\/node_modules\/koa\/lib\/application\.js$/, (App) => {
    patchMethod((App as Klass).prototype, "createContext", (original) =>
      function (this: unknown, ...args: unknown[]) {
        const ctx = original.apply(this, args) as KoaContextLike;
        setRouteOf(ctx.req, () => (typeof ctx._matchedRoute === "string" ? ctx._matchedRoute : undefined));
        const span = requestSpan(ctx.req);
        const startedAt = startedAtOf(ctx.req);
        if (span && startedAt !== undefined) watchRoute(ctx, "_matchedRoute", span, startedAt);
        return ctx;
      }, "auto-koa");
  });
  onLoad(/\/node_modules\/koa\/lib\/context\.js$/, (proto) => {
    patchMethod(proto as object, "onerror", (original) =>
      function (this: KoaContextLike, err: unknown) {
        if (err && this.req) {
          recordRequestError(this.req, err);
          if (currentOwner()?.auto) keepHeaders(err, this.res);
        }
        return original.call(this, err);
      }, "auto-koa");
  });
}

interface FastifyRequestLike {
  raw: IncomingMessage;
  routeOptions?: { url?: string };
}
type Done = () => void;
interface FastifyLike {
  addHook(name: string, hook: (...args: never[]) => void): unknown;
}

function addFastifyHooks(app: FastifyLike): void {
  app.addHook("onRequest", (request: FastifyRequestLike, _reply: unknown, done: Done) => {
    setRouteOf(request.raw, () => request.routeOptions?.url);
    done();
  });
  app.addHook("preHandler", (request: FastifyRequestLike, _reply: unknown, done: Done) => {
    const span = requestSpan(request.raw);
    const startedAt = startedAtOf(request.raw);
    if (span && startedAt !== undefined) markRouted(span, startedAt);
    done();
  });
  app.addHook("onError", (request: FastifyRequestLike, _reply: unknown, error: unknown, done: Done) => {
    recordRequestError(request.raw, error);
    done();
  });
}

/** Fastify announces every new instance on a diagnostics channel, before the app adds its routes. */
function hookFastify(): void {
  subscribe("fastify.initialization", (message) => {
    const app = (message as { fastify?: FastifyLike }).fastify;
    if (app && typeof app.addHook === "function") addFastifyHooks(app);
  });
}


/** Next.js: skip its build files, and give its own spans (render, route handlers, fetch) to WizeLens. */
function hookNext(): void {
  onLoad(/\/node_modules\/next\/dist\/server\/(next|next-server|lib\/start-server)\.js$/, () => {
    ignorePaths(nextIgnore);
    // At the first request, so an OpenTelemetry SDK the app registers in instrumentation.ts keeps its place.
    beforeFirstRequest((owner) => void trace.setGlobalTracerProvider(preciseProvider(owner.parts.provider)));
    return undefined;
  });
}

const FRAMEWORKS: [string, () => void][] = [
  ["express", hookExpress],
  ["koa", hookKoa],
  ["fastify", hookFastify],
  ["hono", hookHono],
  ["next", hookNext],
];

/** Hook every framework the add-on supports, except the ones listed in WIZELENS_AUTO_SKIP. */
export function hookFrameworks(): void {
  for (const [name, hook] of FRAMEWORKS) if (!skipped(name)) hook();
}
