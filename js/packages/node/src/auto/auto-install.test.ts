import type { Span } from "@wizeworks/lens-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AutoApp, eventually, type FakeHub, fakeHub, runApp } from "../test/auto-run.js";

let hub: FakeHub;
let app: AutoApp | undefined;

beforeEach(async () => {
  hub = await fakeHub();
});
afterEach(async () => {
  await app?.stop();
  app = undefined;
  await hub.close();
});

const start = async (fixture: string, service: string, env: Record<string, string> = {}) =>
  (app = await runApp(fixture, { WIZELENS_HUB: hub.url, OTEL_SERVICE_NAME: service, ...env }));

const server = (name: string) => () => hub.spans.find((s) => s.kind === "server" && s.name === name);
const childrenOf = (parent: Span) => hub.spans.filter((s) => s.parentSpanId === parent.spanId);
const logsOf = (parent: Span) => hub.logs.filter((l) => l.traceId === parent.traceId).map((l) => l.log.message);

async function expectBoom(fixture: string, path = "/boom") {
  expect((await app!.get(path)).status).toBe(500);
  await eventually(() => !!server(`GET ${path}`)());
  const boom = server(`GET ${path}`)()!;
  expect(boom.status).toBe("error");
  expect(boom.events.some((e) => e.name === "exception" && String(e.attributes["exception.message"]).includes(`${fixture} boom`))).toBe(true);
}

describe("node --import @wizeworks/lens-node/auto", { timeout: 30_000 }, () => {
  it("traces an Express app with no WizeLens code: route, node:sqlite queries, console lines, and errors", async () => {
    await start("express.mjs", "auto-express");
    expect(await (await app!.get("/orders/1")).json()).toEqual({ id: 1, total: 12.5 });
    await eventually(() => !!server("GET /orders/:id")());
    const span = server("GET /orders/:id")()!;
    expect(span).toMatchObject({ service: "auto-express", attributes: { "http.route": "/orders/:id" } });
    expect(childrenOf(span).map((s) => [s.name, s.attributes["db.system.name"]])).toEqual([["SELECT orders", "sqlite"]]);
    await eventually(() => logsOf(span).includes("loading order 1"));
    await expectBoom("express");
    expect(hub.senders[0]).toMatchObject({ service: "auto-express" });
    expect(app!.output()).toContain("Auto install on for auto-express");
  });

  it("traces Fastify routes, better-sqlite3 queries, and pino lines", async () => {
    await start("fastify.mjs", "auto-fastify");
    await app!.get("/items/1");
    await eventually(() => !!server("GET /items/:id")());
    const span = server("GET /items/:id")()!;
    expect(childrenOf(span).map((s) => s.attributes["wizelens.db.adapter"])).toEqual(["better-sqlite3"]);
    await eventually(() => logsOf(span).includes("reading item"));
    await expectBoom("fastify");
  });

  it("traces Koa with @koa/router and winston", async () => {
    await start("koa.mjs", "auto-koa");
    await app!.get("/carts/7");
    await eventually(() => !!server("GET /carts/:id")());
    await eventually(() => logsOf(server("GET /carts/:id")()!).includes("reading cart"));
    await expectBoom("koa");
  });

  it("traces Hono on @hono/node-server", async () => {
    await start("hono.mjs", "auto-hono");
    await app!.get("/users/1");
    await eventually(() => !!server("GET /users/:id")());
    expect(childrenOf(server("GET /users/:id")()!)).toHaveLength(1);
    await expectBoom("hono");
  });
});

describe("node --import @wizeworks/lens-node/auto with GraphQL", { timeout: 30_000 }, () => {
  it("traces GraphQL operations from the CommonJS and ES module builds, and names the request after them", async () => {
    await start("graphql.mjs", "auto-graphql");
    const res = await app!.get(`/graphql?query=${encodeURIComponent('query GetOrders { orders(status: "open") }')}`);
    expect(await res.json()).toEqual({ data: { orders: [{ id: 1 }] } });
    await eventually(() => !!server("GET /graphql (GetOrders)")() && hub.spans.some((s) => s.name === "query GetOrders"));
    const [op] = childrenOf(server("GET /graphql (GetOrders)")()!);
    expect(op).toMatchObject({ name: "query GetOrders", attributes: { "graphql.document": 'query GetOrders { orders(status: "*") }' } });
    await app!.get(`/graphql?esm=1&query=${encodeURIComponent("query FromEsm { orders }")}`);
    await eventually(() => hub.spans.some((s) => s.name === "query FromEsm"));
    expect(server("GET /graphql (FromEsm)")()).toBeDefined();
  });
});

describe("node --import @wizeworks/lens-node/auto with graphql 17", { timeout: 30_000 }, () => {
  it("traces operations of the real graphql 17 ES module build through its tracing channels", async () => {
    await start("graphql17.mjs", "auto-graphql17");
    const res = await app!.get(`/graphql?query=${encodeURIComponent('query OpenOrders { orders(status: "open") }')}`);
    expect(await res.json()).toEqual({ data: { orders: [1, 2] } });
    await eventually(() => !!server("GET /graphql (OpenOrders)")() && hub.spans.some((s) => s.name === "query OpenOrders"));
    const [op] = childrenOf(server("GET /graphql (OpenOrders)")()!);
    expect(op).toMatchObject({ name: "query OpenOrders", attributes: { "graphql.document": 'query OpenOrders { orders(status: "*") }' } });
  });
});

describe("the auto install and the code install", { timeout: 30_000 }, () => {
  it("steps aside when the app installs WizeLens in code: one span per request, owned by the code install", async () => {
    await start("code-install.mjs", "auto-name");
    await app!.get("/notes");
    await eventually(() => hub.spans.some((s) => s.kind === "server"));
    await new Promise((r) => setTimeout(r, 1500));
    const servers = hub.spans.filter((s) => s.kind === "server");
    expect(servers.map((s) => [s.service, s.name])).toEqual([["code-app", "GET /notes"]]);
    // The auto install already hooked node:sqlite; its spans now go to the code install.
    expect(childrenOf(servers[0]!).map((s) => s.service)).toEqual(["code-app"]);
    expect(hub.senders.every((s) => s.service === "code-app")).toBe(true);
    expect(app!.output()).toContain("code-app installs WizeLens in code, so the auto install steps aside");
  });

  it("does nothing when WIZELENS_ENABLED is false", async () => {
    await start("express.mjs", "auto-off", { WIZELENS_ENABLED: "false" });
    expect((await app!.get("/orders/1")).headers.get("x-wizelens-trace")).toBeNull();
    await new Promise((r) => setTimeout(r, 1500));
    expect(hub.spans).toEqual([]);
    expect(app!.output()).not.toContain("Auto install on");
  });
});
