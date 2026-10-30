import type { IncomingMessage, ServerResponse } from "node:http";
import { context } from "@opentelemetry/api";
import { captureOf } from "../adapters/registry.js";
import { captureRequest, isOwnPath, isUntraced, pathOf, serveOwnPath, withoutTracing } from "../request-capture.js";
import { recordOn } from "../spans.js";
import type { WizeLens } from "../types.js";

// Minimal Hono shape, so the add-on has no dependency on Hono. Node objects come from @hono/node-server.
export interface HonoContextLike {
  env?: { incoming?: IncomingMessage; outgoing?: ServerResponse };
  req: { matchedRoutes?: { method: string; path: string }[] };
  error?: unknown;
}

type HonoNext = () => Promise<void>;

/** Tells @hono/node-server that the response was already written to the Node response. */
const alreadySent = () => new Response(null, { headers: { "x-hono-already-sent": "true" } });

/** The route of the handler that answered: the last matched route that is not middleware. */
export function honoRoute(c: HonoContextLike): string | undefined {
  const routes = c.req.matchedRoutes ?? [];
  return routes.filter((r) => r.method !== "ALL").pop()?.path;
}

/** Hono middleware for @hono/node-server: `app.use(wizeLensHono(wizelens))`. Use it first. */
export function wizeLensHono(wizelens: WizeLens) {
  return async function wizelensHonoMiddleware(context_: unknown, next: HonoNext): Promise<Response | void> {
    const c = context_ as HonoContextLike;
    const d = captureOf(wizelens);
    const incoming = c.env?.incoming;
    const outgoing = c.env?.outgoing;
    if (!d || !incoming || !outgoing) return next();
    const rawUrl = incoming.url ?? "/";
    if (isOwnPath(d, pathOf(rawUrl))) {
      await serveOwnPath(d, incoming, outgoing);
      return alreadySent();
    }
    if (isUntraced(incoming)) return withoutTracing(next);
    const { span, ctx } = captureRequest(d, incoming, outgoing, rawUrl, () => honoRoute(c));
    await context.with(ctx, next);
    if (c.error) recordOn(span, c.error);
  };
}
