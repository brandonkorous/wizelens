import type { IncomingMessage } from "node:http";
import type { Span as OtelSpan } from "@opentelemetry/api";
import { patchMethod } from "../adapters/registry.js";
import { requestSpan } from "../request-capture.js";
import { recordOn } from "../spans.js";

// Minimal rxjs and Nest shapes, so the add-on has no dependency on either.
interface ObserverLike {
  next?(value: unknown): void;
  error?(err: unknown): void;
  complete?(): void;
}
interface ObservableLike {
  subscribe(observer: ObserverLike): unknown;
}
type ObservableClass = new (subscribe: (subscriber: ObserverLike) => unknown) => ObservableLike;
interface ArgumentsHostLike {
  getArgByIndex?(index: number): unknown;
}
type Method = (this: unknown, ...args: unknown[]) => unknown;

const recorded = new WeakMap<OtelSpan, unknown>();

/** The Node request behind what Nest hands out: the Express request itself, or the Fastify request's `raw`. */
export function rawRequest(req: unknown): IncomingMessage | undefined {
  const r = req as { raw?: unknown; headers?: unknown } | null | undefined;
  if (r?.raw && typeof r.raw === "object" && "headers" in r.raw) return r.raw as IncomingMessage;
  return r && typeof r === "object" && r.headers ? (r as IncomingMessage) : undefined;
}

/** Record a Nest exception on its request's span, once, however many hooks see it. */
export function recordNestError(req: IncomingMessage | undefined, err: unknown): void {
  const span = req ? requestSpan(req) : undefined;
  if (!span || err === undefined || recorded.get(span) === err) return;
  recorded.set(span, err);
  recordOn(span, err);
}

/** The HTTP status of a Nest HttpException, if it is one. */
function statusOf(err: unknown): number | undefined {
  const getStatus = (err as { getStatus?: unknown } | null)?.getStatus;
  return typeof getStatus === "function" ? Number(getStatus.call(err)) : undefined;
}

/** An rxjs-compatible stream from a subscribe function: one of the source's own class, else an interop observable. */
function streamLike(source: ObservableLike, subscribe: (subscriber: ObserverLike) => unknown): unknown {
  const Ctor = source.constructor as unknown;
  if (typeof Ctor === "function" && Ctor !== Object) return new (Ctor as ObservableClass)(subscribe);
  const out: Record<string | symbol, unknown> = { subscribe };
  const self = () => out;
  out["@@observable"] = self;
  const symbol = (Symbol as { observable?: symbol }).observable;
  if (symbol) out[symbol] = self;
  return out;
}

/** The handler's stream with `onError` called before an error goes on to Nest's exception filters. */
export function tapErrors(source: unknown, onError: (err: unknown) => void): unknown {
  const s = source as ObservableLike | null | undefined;
  if (!s || typeof s.subscribe !== "function") return source;
  return streamLike(s, (subscriber) =>
    s.subscribe({
      next: (value) => subscriber.next?.(value),
      error: (err) => {
        onError(err);
        subscriber.error?.(err);
      },
      complete: () => subscriber.complete?.(),
    }),
  );
}

/** Wrap one exception handler: every exception it is given is recorded, except the 404 of a path no route matched. */
function hookHandler(handler: unknown, appLevel: boolean): void {
  if (!handler || typeof handler !== "object") return;
  patchMethod(handler, "next", (next) =>
    function (this: unknown, exception: unknown, host: unknown) {
      if (!(appLevel && statusOf(exception) === 404)) {
        const req = (host as ArgumentsHostLike | null)?.getArgByIndex?.(0);
        recordNestError(rawRequest(req), exception);
      }
      return next.call(this, exception, host);
    }, "nest-filter");
}

/** Hook Nest's RouterExceptionFilters so every exception its filters answer (guards, pipes, handlers, middleware) is recorded. Run before `app.init()`. */
export function hookExceptionFilters(filters: object): boolean {
  return patchMethod(filters, "create", (original) =>
    function (this: unknown, ...args: unknown[]) {
      const handler = original.apply(this, args);
      const owner = args[0];
      // The not-found and error handlers of the app are made for a plain `{}`, not a controller.
      const appLevel = !!owner && Object.getPrototypeOf(owner) === Object.prototype;
      hookHandler(handler, appLevel);
      return handler;
    } as Method, "nest-filters");
}
