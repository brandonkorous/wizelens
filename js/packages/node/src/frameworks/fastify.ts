import type { IncomingMessage, ServerResponse } from "node:http";
import { context } from "@opentelemetry/api";
import { captureOf } from "../adapters/registry.js";
import { captureRequest, type CaptureDeps, type CapturedRequest, isOwnPath, isUntraced, pathOf, serveOwnPath, withoutTracing } from "../request-capture.js";
import { instrumentPino } from "../logs/pino.js";
import { markRouted } from "../route-timing.js";
import { recordOn } from "../spans.js";
import type { WizeLens } from "../types.js";

// Minimal Fastify shapes, so the add-on has no dependency on Fastify.
interface FastifyRequestLike {
  raw: IncomingMessage & { body?: unknown };
  body?: unknown;
  routeOptions?: { url?: string };
}
interface FastifyReplyLike {
  raw: ServerResponse;
  hijack(): void;
}
type Done = (err?: Error) => void;
type Hook = (request: FastifyRequestLike, reply: FastifyReplyLike, done: Done) => void;
type ErrorHook = (request: FastifyRequestLike, reply: FastifyReplyLike, error: Error, done: Done) => void;
type RouteHandler = (request: FastifyRequestLike, reply: FastifyReplyLike) => void;
type ContentParser = (request: unknown, payload: unknown, done: (err: Error | null, body?: unknown) => void) => void;
interface FastifyLike {
  addHook(name: "onRequest" | "preHandler", hook: Hook): unknown;
  addHook(name: "onError", hook: ErrorHook): unknown;
  register(plugin: (child: FastifyLike, opts: unknown, done: Done) => void): unknown;
  removeAllContentTypeParsers(): void;
  addContentTypeParser(type: string, parser: ContentParser): void;
  all(path: string, handler: RouteHandler): unknown;
}

const requests = new WeakMap<IncomingMessage, CapturedRequest>();

function addHooks(app: FastifyLike, d: CaptureDeps): void {
  app.addHook("onRequest", (request, reply, done) => {
    const rawUrl = request.raw.url ?? "/";
    if (isOwnPath(d, pathOf(rawUrl))) return done();
    if (isUntraced(request.raw)) return withoutTracing(() => done());
    const captured = captureRequest(d, request.raw, reply.raw, rawUrl, () => request.routeOptions?.url);
    requests.set(request.raw, captured);
    context.with(captured.ctx, () => done());
  });
  app.addHook("preHandler", (request, _reply, done) => {
    const captured = requests.get(request.raw);
    if (captured) markRouted(captured.span, captured.startedAt);
    done();
  });
  app.addHook("onError", (request, _reply, error, done) => {
    const captured = requests.get(request.raw);
    if (captured) recordOn(captured.span, error);
    done();
  });
}

/** The dashboard and API routes, in their own scope so the raw body stays unread for the WizeLens handler. */
function addOwnRoutes(app: FastifyLike, d: CaptureDeps): void {
  app.register((child, _opts, done) => {
    child.removeAllContentTypeParsers();
    child.addContentTypeParser("*", (_request, _payload, next) => next(null, undefined));
    const serve: RouteHandler = (request, reply) => {
      reply.hijack();
      void serveOwnPath(d, request.raw, reply.raw);
    };
    child.all(d.basePath, serve);
    child.all(`${d.basePath}/*`, serve);
    done();
  });
}

/** A Fastify plugin: `await app.register(wizelensFastify(wizelens))`. Register it before your routes. */
export function wizelensFastify(wizelens: WizeLens) {
  const plugin = (app: unknown, _opts: unknown, done: Done): void => {
    const d = captureOf(wizelens);
    if (d) {
      addHooks(app as FastifyLike, d);
      addOwnRoutes(app as FastifyLike, d);
      // Fastify logs with pino: `request.log` and `app.log` lines go into the trace.
      instrumentPino(wizelens, (app as { log?: unknown }).log);
    }
    done();
  };
  // Not encapsulated: the hooks see every route of the app.
  Object.assign(plugin, { [Symbol.for("skip-override")]: true, [Symbol.for("fastify.display-name")]: "wizelens" });
  return plugin;
}
