import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express, { type Express } from "express";
import Fastify, { type FastifyInstance } from "fastify";
import type { Running } from "./helpers.js";

// A stand-in for a NestJS app: enough of its router, interceptors, and exception filters to test the add-on without Nest.

type Platform = "express" | "fastify";
type Reply = (res: unknown, body: unknown, status: number) => void;
type Req = { method?: string; url?: string; path?: string; params?: Record<string, string>; headers: Record<string, unknown> };
interface Observer {
  next?(value: unknown): void;
  error?(err: unknown): void;
  complete?(): void;
}
interface Interceptor {
  intercept(ctx: unknown, next: { handle(): unknown }): unknown;
}
interface Host {
  getArgByIndex(index: number): unknown;
}

/** Nest's HttpException: a message and a status. */
export class HttpException extends Error {
  constructor(message: string, private readonly status: number) {
    super(message);
  }
  getStatus(): number {
    return this.status;
  }
}

/** rxjs's Observable, reduced to what Nest and an interceptor use. */
export class FakeObservable {
  constructor(private readonly producer: (observer: Observer) => void) {}
  subscribe(observer: Observer): { unsubscribe(): void } {
    this.producer(observer);
    return { unsubscribe: () => {} };
  }
}

/** Nest's default exception handler: the HttpException's status, else 500. */
class ExceptionsHandler {
  constructor(private readonly reply: Reply) {}
  next(exception: unknown, host: Host): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    this.reply(host.getArgByIndex(1), { statusCode: status, message: (exception as Error).message }, status);
  }
}

class RouterExceptionFilters {
  constructor(private readonly reply: Reply) {}
  create(_owner: object, _callback: unknown, _module?: string): ExceptionsHandler {
    return new ExceptionsHandler(this.reply);
  }
}

/** One controller method, with an optional guard that answers 403. */
export interface FakeRoute {
  controller: new () => object;
  method: "GET" | "POST";
  path: string;
  handler: string;
  guard?: (req: Req) => boolean;
}

const lastValue = (source: unknown): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let last: unknown;
    (source as FakeObservable).subscribe({ next: (v) => (last = v), error: reject, complete: () => resolve(last) });
  });

function contextOf(route: FakeRoute, req: unknown, res: unknown) {
  return {
    getType: () => "http",
    getClass: () => route.controller,
    getHandler: () => (route.controller.prototype as Record<string, unknown>)[route.handler],
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  };
}

/** A Nest app on Express or Fastify. With `routerRoutes: false`, routes are matched by hand, so the router knows no route. */
export class FakeNestApp {
  readonly config = { getGlobalPrefix: () => this.prefix, getVersioning: () => this.versioning };
  readonly routesResolver = { routerExceptionsFilter: new RouterExceptionFilters((res, body, status) => this.reply(res, body, status)) };
  readonly express: Express | undefined;
  readonly fastify: FastifyInstance | undefined;
  private readonly interceptors: Interceptor[] = [];
  private prefix = "";
  private versioning: { type: number; prefix?: string } | undefined;

  constructor(readonly platform: Platform, private readonly routes: FakeRoute[], private readonly routerRoutes = true) {
    if (platform === "express") this.express = express();
    else this.fastify = Fastify();
  }

  getHttpAdapter = () => ({ getType: () => this.platform });
  use = (...args: unknown[]) => void (this.express!.use as (...a: unknown[]) => unknown)(...args);
  register = (plugin: unknown) => (this.fastify!.register as (p: unknown) => unknown)(plugin);
  useGlobalInterceptors = (...interceptors: unknown[]) => void this.interceptors.push(...(interceptors as Interceptor[]));
  setGlobalPrefix = (prefix: string) => void (this.prefix = prefix);
  enableVersioning = (prefix = "v") => void (this.versioning = { type: 0, prefix });

  private reply(res: unknown, body: unknown, status: number): void {
    if (this.platform === "express") (res as express.Response).status(status).json(body);
    else void (res as { code(s: number): { send(b: unknown): unknown } }).code(status).send(body);
  }

  private fullPath(route: FakeRoute, controllerPath: string, version: string | undefined): string {
    const v = this.versioning && version ? `${this.versioning.prefix ?? "v"}${version}` : "";
    return `/${[this.prefix, v, controllerPath, route.path].filter(Boolean).join("/")}`;
  }

  private chain(ctx: unknown, call: () => unknown): unknown {
    let next = call;
    for (const interceptor of [...this.interceptors].reverse()) {
      const inner = next;
      next = () => interceptor.intercept(ctx, { handle: inner });
    }
    return next();
  }

  private async run(route: FakeRoute, exceptions: ExceptionsHandler, req: unknown, res: unknown): Promise<void> {
    const host = { getArgByIndex: (i: number) => [req, res][i] };
    try {
      if (route.guard && !route.guard(req as Req)) throw new HttpException("Forbidden resource", 403);
      const instance = new route.controller() as Record<string, (r: unknown) => unknown>;
      const call = () =>
        new FakeObservable((o) => {
          Promise.resolve()
            .then(() => instance[route.handler]!(req))
            .then((value) => (o.next?.(value), o.complete?.()), (err: unknown) => o.error?.(err));
        });
      this.reply(res, await lastValue(this.chain(contextOf(route, req, res), call)), 200);
    } catch (err) {
      exceptions.next(err, host);
    }
  }

  private addRoute(route: FakeRoute): void {
    const meta = (key: string, target: object) => (Reflect as unknown as { getMetadata(k: string, t: object): unknown }).getMetadata(key, target);
    const path = this.fullPath(route, String(meta("path", route.controller) ?? ""), meta("__version__", route.controller) as string | undefined);
    const exceptions = this.routesResolver.routerExceptionsFilter.create(new route.controller(), route.handler, "AppModule");
    const run = (req: unknown, res: unknown) => void this.run(route, exceptions, req, res);
    if (this.fastify) return void this.fastify.route({ method: route.method, url: path, handler: (request, reply) => run(request, reply) });
    if (this.routerRoutes) return void this.express![route.method === "GET" ? "get" : "post"](path, run);
    const pattern = new RegExp(`^${path.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`);
    this.express!.use((req, res, next) => {
      const match = req.method === route.method ? pattern.exec(req.path) : null;
      if (!match) return next();
      req.params = { ...match.groups };
      run(req, res);
    });
  }

  private addNotFound(): void {
    const notFound = this.routesResolver.routerExceptionsFilter.create({}, undefined);
    const answer = (req: Req, res: unknown) => notFound.next(new HttpException(`Cannot ${req.method} ${req.url}`, 404), { getArgByIndex: (i) => [req, res][i] });
    if (this.fastify) this.fastify.setNotFoundHandler((request, reply) => answer(request as unknown as Req, reply));
    else this.express!.use((req, res) => answer(req as unknown as Req, res));
  }

  /** Register the routes, like `app.init()`, and listen on a free port. */
  async listen(): Promise<Running> {
    for (const route of this.routes) this.addRoute(route);
    this.addNotFound();
    if (this.fastify) {
      await this.fastify.listen({ port: 0, host: "127.0.0.1" });
      const port = (this.fastify.server.address() as AddressInfo).port;
      return { base: `http://127.0.0.1:${port}`, close: () => this.fastify!.close() };
    }
    const server = createServer(this.express);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { base, close: () => new Promise<void>((r) => server.close(() => r())) };
  }
}
