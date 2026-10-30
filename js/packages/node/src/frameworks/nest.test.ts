import "reflect-metadata";
import { afterAll, describe, expect, it } from "vitest";
import type { Span, Trace } from "@wizeworks/lens-core";
import { FakeNestApp, type FakeRoute } from "../test/nest-fake.js";
import type { WizeLens } from "../types.js";
import { createWizeLens } from "../wizelens.js";
import { instrumentNest, WizeLensNestInterceptor } from "./nest.js";

class OrdersController {
  findOne(req: { params: { id: string } }) {
    return { id: Number(req.params.id) };
  }
  boom(): never {
    throw new Error("kaboom");
  }
  secret() {
    return "never seen";
  }
}
const define = (key: string, value: unknown, target: object) => (Reflect as unknown as { defineMetadata(k: string, v: unknown, t: object): void }).defineMetadata(key, value, target);
define("path", "orders", OrdersController);
define("__version__", "1", OrdersController);
define("path", ":id", OrdersController.prototype.findOne);
define("path", "boom/now", OrdersController.prototype.boom);
define("path", "admin/secret", OrdersController.prototype.secret);

const ROUTES: FakeRoute[] = [
  { controller: OrdersController, method: "GET", path: "boom/now", handler: "boom" },
  { controller: OrdersController, method: "GET", path: "admin/secret", handler: "secret", guard: () => false },
  { controller: OrdersController, method: "GET", path: ":id", handler: "findOne" },
];

const closers: (() => Promise<unknown>)[] = [];
afterAll(async () => void (await Promise.all(closers.map((c) => c()))));

const make = () => createWizeLens({ service: "nest-api", storage: "memory", instrumentFetch: false });

async function start(platform: "express" | "fastify", routerRoutes = true): Promise<{ wl: WizeLens; app: FakeNestApp; base: string }> {
  const wl = make();
  const app = new FakeNestApp(platform, ROUTES, routerRoutes);
  app.setGlobalPrefix("api");
  app.enableVersioning();
  expect(instrumentNest(wl, app)).toBe(true);
  const running = await app.listen();
  closers.push(() => running.close(), () => wl.shutdown());
  return { wl, app, base: running.base };
}

async function serverOf(wl: WizeLens, res: Response): Promise<Span> {
  await new Promise((r) => setTimeout(r, 30));
  const t = wl.store.get(res.headers.get("x-wizelens-trace")!) as Trace;
  return t.spans.find((s) => s.kind === "server")!;
}

const exceptions = (span: Span) => span.events.filter((e) => e.name === "exception").map((e) => e.attributes["exception.message"]);

/** The same checks on every platform: route template, names, handler errors, guard errors, and unmatched paths. */
async function check(wl: WizeLens, base: string): Promise<void> {
  const ok = await fetch(`${base}/api/v1/orders/7`);
  expect(await ok.json()).toEqual({ id: 7 });
  const span = await serverOf(wl, ok);
  expect(span).toMatchObject({ name: "GET /api/v1/orders/:id", status: "unset" });
  expect(span.attributes).toMatchObject({ "http.route": "/api/v1/orders/:id", "nest.controller": "OrdersController", "nest.handler": "findOne", "nest.version": "1" });

  const boom = await fetch(`${base}/api/v1/orders/boom/now`);
  expect(boom.status).toBe(500);
  const failed = await serverOf(wl, boom);
  expect(failed).toMatchObject({ name: "GET /api/v1/orders/boom/now", status: "error", attributes: { "http.response.status_code": 500, "nest.handler": "boom" } });
  expect(exceptions(failed)).toEqual(["kaboom"]);

  const guarded = await fetch(`${base}/api/v1/orders/admin/secret`);
  expect(guarded.status).toBe(403);
  const denied = await serverOf(wl, guarded);
  expect(exceptions(denied)).toEqual(["Forbidden resource"]);
  expect(denied.attributes["http.response.status_code"]).toBe(403);

  const missing = await fetch(`${base}/api/nothing`);
  expect(missing.status).toBe(404);
  const unmatched = await serverOf(wl, missing);
  expect(unmatched.status).toBe("unset");
  expect(exceptions(unmatched)).toEqual([]);
}

describe("instrumentNest", () => {
  it("traces a Nest app on Express", async () => {
    const { wl, base } = await start("express");
    await check(wl, base);
    expect((await fetch(`${base}/_wizelens/api/info`)).status).toBe(200);
  });

  it("traces a Nest app on Fastify", async () => {
    const { wl, base } = await start("fastify");
    await check(wl, base);
  });

  it("names the route from Nest's metadata when the router knows none", async () => {
    const { wl, base } = await start("express", false);
    await check(wl, base);
  });

  it("installs once, and not at all when WizeLens is off or the app is not a Nest app", async () => {
    const { wl, app } = await start("express");
    expect(instrumentNest(wl, app)).toBe(true);
    expect((app as unknown as { interceptors: unknown[] }).interceptors).toHaveLength(1);
    expect(instrumentNest(createWizeLens({ service: "off", enabled: false }), new FakeNestApp("express", []))).toBe(false);
    expect(instrumentNest(wl, {})).toBe(false);
  });
});

describe("WizeLensNestInterceptor", () => {
  it("passes other contexts (GraphQL, RPC) and untraced requests straight through", () => {
    const interceptor = new WizeLensNestInterceptor();
    const stream = { subscribe: () => ({}) };
    const handler = { handle: () => stream };
    const graphql = { getType: () => "graphql", getClass: () => OrdersController, getHandler: () => OrdersController.prototype.findOne };
    expect(interceptor.intercept(graphql, handler)).toBe(stream);
    const http = { ...graphql, getType: () => "http", switchToHttp: () => ({ getRequest: () => ({ headers: {}, url: "/" }) }) };
    expect(interceptor.intercept(http, handler)).toBe(stream);
  });
});
