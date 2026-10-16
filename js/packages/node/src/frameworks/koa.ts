import type { IncomingMessage, ServerResponse } from "node:http";
import { context } from "@opentelemetry/api";
import { HEADER_ENDPOINT, HEADER_TRACE } from "@wizeworks/lens-core";
import { captureOf } from "../adapters/registry.js";
import { captureRequest, isOwnPath, isPreflight, pathOf, serveOwnPath } from "../request-capture.js";
import { watchRoute } from "../route-timing.js";
import { recordOn } from "../spans.js";
import type { WizeLens } from "../types.js";

// Minimal Koa shape, so the add-on has no dependency on Koa.
interface KoaContextLike {
  req: IncomingMessage;
  res: ServerResponse;
  respond?: boolean;
  _matchedRoute?: unknown;
}

type KoaNext = () => Promise<unknown>;

const KEEP = [HEADER_TRACE, HEADER_ENDPOINT, "Access-Control-Expose-Headers"];

/** Koa's error handler removes all headers, then sets `err.headers`. Keep the WizeLens headers so the browser can link the failure. */
function keepHeaders(err: unknown, res: ServerResponse): void {
  if (!err || typeof err !== "object") return;
  const e = err as { headers?: Record<string, unknown> };
  const kept = Object.fromEntries(KEEP.map((h) => [h, res.getHeader(h)]).filter(([, v]) => v !== undefined));
  e.headers = { ...e.headers, ...kept };
}

/** Koa middleware: `app.use(wizelensKoa(wizelens))`. Use it first. Reads the route from @koa/router. */
export function wizelensKoa(wizelens: WizeLens) {
  return async function wizelensKoaMiddleware(ctx: KoaContextLike, next: KoaNext): Promise<void> {
    const d = captureOf(wizelens);
    if (!d) return void (await next());
    const rawUrl = ctx.req.url ?? "/";
    if (isOwnPath(d, pathOf(rawUrl))) {
      ctx.respond = false;
      return serveOwnPath(d, ctx.req, ctx.res);
    }
    if (isPreflight(ctx.req)) return void (await next());
    const route = () => (typeof ctx._matchedRoute === "string" ? ctx._matchedRoute : undefined);
    const { span, ctx: otelCtx, startedAt } = captureRequest(d, ctx.req, ctx.res, rawUrl, route);
    watchRoute(ctx, "_matchedRoute", span, startedAt);
    try {
      await context.with(otelCtx, next);
    } catch (err) {
      recordOn(span, err);
      keepHeaders(err, ctx.res);
      throw err;
    }
  };
}
