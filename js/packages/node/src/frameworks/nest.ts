import type { Span as OtelSpan } from "@opentelemetry/api";
import { captureOf } from "../adapters/registry.js";
import { pathOf, requestSpan } from "../request-capture.js";
import { setFallbackRoute } from "../request-naming.js";
import type { Req, WizeLens } from "../types.js";
import { wizeLensFastify } from "./fastify.js";
import { hookExceptionFilters, rawRequest, recordNestError, tapErrors } from "./nest-errors.js";
import { type NestConfigHolder, type NestContextLike, nestRoute, versionsOf } from "./nest-route.js";

// Minimal NestJS shapes, so the add-on has no dependency on Nest.
interface ExecutionContextLike extends NestContextLike {
  getType?(): string;
  switchToHttp?(): { getRequest?(): unknown };
}
interface CallHandlerLike {
  handle(): unknown;
}
interface NestAppLike extends NestConfigHolder {
  use?(...args: unknown[]): unknown;
  register?(plugin: unknown): unknown;
  useGlobalInterceptors?(...interceptors: unknown[]): unknown;
  getHttpAdapter?(): { getType?(): string } | undefined;
  routesResolver?: { routerExceptionsFilter?: object };
}

export interface NestOptions {
  /** Add the request capture for the app's platform (Express middleware or the Fastify plugin). False when you added it yourself. Default true. */
  capture?: boolean;
}

// Apps already hooked. A set, not a mark on the app: NestFactory returns a Proxy that refuses new properties.
const installed = new WeakSet<object>();

/** Controller, handler, version, and the metadata route of the handler that answers this request. */
function describeHandler(span: OtelSpan, ctx: ExecutionContextLike, app: NestAppLike | undefined, path: string): void {
  const controller = ctx.getClass().name;
  const handler = ctx.getHandler().name;
  if (controller) span.setAttribute("nest.controller", controller);
  if (handler) span.setAttribute("nest.handler", handler);
  const version = versionsOf(ctx, app?.config?.getVersioning?.()?.defaultVersion)[0];
  if (version) span.setAttribute("nest.version", version);
  const route = nestRoute(ctx, app, path);
  if (route) setFallbackRoute(span, route);
}

/** A NestJS interceptor that names the request by its controller and handler and records what they throw: `app.useGlobalInterceptors(new WizeLensNestInterceptor(app))`. */
export class WizeLensNestInterceptor {
  private readonly app: NestAppLike | undefined;

  constructor(app?: unknown) {
    this.app = app as NestAppLike | undefined;
  }

  intercept(context: unknown, next: unknown): unknown {
    const ctx = context as ExecutionContextLike;
    const handler = next as CallHandlerLike;
    const req = ctx.getType?.() === "http" ? rawRequest(ctx.switchToHttp?.().getRequest?.()) : undefined;
    const span = req ? requestSpan(req) : undefined;
    if (!req || !span) return handler.handle();
    describeHandler(span, ctx, this.app, pathOf((req as Req).originalUrl ?? req.url ?? "/"));
    return tapErrors(handler.handle(), (err) => recordNestError(req, err));
  }
}

/** Add the global interceptor and the exception filter hook to a Nest app, once. */
export function addNestHooks(app: unknown): boolean {
  const a = app as NestAppLike | null | undefined;
  if (!a || typeof a.useGlobalInterceptors !== "function") return false;
  if (installed.has(a)) return true;
  installed.add(a);
  a.useGlobalInterceptors(new WizeLensNestInterceptor(a));
  const filters = a.routesResolver?.routerExceptionsFilter;
  if (filters) hookExceptionFilters(Object.getPrototypeOf(filters) as object);
  return true;
}

/** Capture requests the way the app's platform needs: the Express middleware, or the Fastify plugin. */
function addCapture(wizelens: WizeLens, app: NestAppLike): void {
  const platform = app.getHttpAdapter?.()?.getType?.();
  if (platform === "express") app.use?.(wizelens.middleware);
  else if (platform === "fastify") void app.register?.(wizeLensFastify(wizelens));
}

/** Trace a NestJS app on Express or Fastify: call `instrumentNest(wizelens, app)` right after `NestFactory.create`, before `app.listen()`. */
export function instrumentNest(wizelens: WizeLens, app: unknown, options: NestOptions = {}): boolean {
  const a = app as NestAppLike | null | undefined;
  if (!captureOf(wizelens) || !a || typeof a.useGlobalInterceptors !== "function") return false;
  if (installed.has(a)) return true;
  if (options.capture !== false) addCapture(wizelens, a);
  return addNestHooks(a);
}
