import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import Router from "@koa/router";
import Fastify from "fastify";
import { Hono } from "hono";
import Koa from "koa";
import { afterAll, describe, expect, it } from "vitest";
import { ATTR_ROUTED_MS, type Trace } from "@wizeworks/lens-core";
import { createWizeLens } from "../wizelens.js";
import type { WizeLens } from "../types.js";
import { wizelensFastify } from "./fastify.js";
import { wizelensHono } from "./hono.js";
import { wizelensKoa } from "./koa.js";

const make = (name: string) => createWizeLens({ serviceName: name, storage: "memory", instrumentFetch: false, captureResponseBody: true });
const lookup = (wl: WizeLens) => wl.traceDb({ system: "sqlite" }, "SELECT * FROM items WHERE id = ?", [7], () => [{ id: 7 }]);
const closers: (() => Promise<unknown>)[] = [];
afterAll(async () => void (await Promise.all(closers.map((c) => c()))));

const baseOf = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function traceOf(wl: WizeLens, res: Response): Promise<Trace> {
  await new Promise((r) => setTimeout(r, 30));
  return wl.store.get(res.headers.get("x-wizelens-trace")!)!;
}

/** The same checks for every framework: span, route, nested query, errors, and the dashboard routes. */
async function check(wl: WizeLens, base: string, routed: boolean): Promise<void> {
  const ok = await fetch(`${base}/items/7`);
  expect(await ok.json()).toEqual([{ id: 7 }]);
  const t = await traceOf(wl, ok);
  const server = t.spans.find((s) => s.category === "http.server")!;
  const db = t.spans.find((s) => s.category === "db")!;
  expect(server).toMatchObject({ name: "GET /items/:id", status: "unset" });
  expect(server.attributes).toMatchObject({ "http.route": "/items/:id", "http.response.status_code": 200, "url.path": "/items/7" });
  expect(server.attributes["wizelens.response.body"]).toBe('[{"id":7}]');
  expect(db.parentSpanId).toBe(server.spanId);
  if (routed) expect(server.attributes[ATTR_ROUTED_MS]).toBeTypeOf("number");
  const bad = await traceOf(wl, await fetch(`${base}/boom`));
  expect(bad.spans.find((s) => s.category === "http.server")!.status).toBe("error");
  const preflight = await fetch(`${base}/items/7`, { method: "OPTIONS", headers: { "access-control-request-method": "GET" } });
  expect(preflight.headers.get("x-wizelens-trace")).toBeNull();
  expect((await fetch(`${base}/_wizelens/api/info`)).status).toBe(200);
  const spans = await fetch(`${base}/_wizelens/api/client-spans`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"spans":[]}' });
  expect(spans.status).toBe(204);
}

describe("fastify", () => {
  it("captures requests and serves the dashboard", async () => {
    const wl = make("fastify-api");
    const app = Fastify();
    await app.register(wizelensFastify(wl));
    app.get("/items/:id", async () => lookup(wl));
    app.get("/boom", async () => {
      throw new Error("boom");
    });
    app.get("/missing", async () => {
      throw Object.assign(new Error("Builder page not found"), { statusCode: 404 });
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    closers.push(() => app.close());
    await check(wl, baseOf(app.server), true);
    // A thrown 404 keeps its exception but is not a failure.
    const missing = (await traceOf(wl, await fetch(`${baseOf(app.server)}/missing`))).spans.find((s) => s.category === "http.server")!;
    expect(missing.status).toBe("unset");
    expect(missing.attributes["http.response.status_code"]).toBe(404);
    expect(missing.events.map((e) => e.name)).toContain("exception");
  });

  it("does not fail a 503 the app marked as expected, by header or by call", async () => {
    const wl = make("fastify-expected");
    const app = Fastify();
    await app.register(wizelensFastify(wl));
    app.get("/paused", async (_req, reply) => reply.header("X-WizeLens-Expected", "1").code(503).send("come back later"));
    app.get("/maintenance", async (_req, reply) => {
      wl.expected();
      return reply.code(503).send("come back later");
    });
    app.get("/down", async (_req, reply) => reply.code(503).send("down"));
    await app.listen({ port: 0, host: "127.0.0.1" });
    closers.push(() => app.close());
    const serverOf = async (path: string) => {
      const res = await fetch(`${baseOf(app.server)}${path}`);
      expect(res.headers.get("access-control-expose-headers")).toContain("X-WizeLens-Expected");
      return (await traceOf(wl, res)).spans.find((s) => s.category === "http.server")!;
    };
    for (const path of ["/paused", "/maintenance"]) {
      const span = await serverOf(path);
      expect(span.status).toBe("unset");
      expect(span.attributes).toMatchObject({ "http.response.status_code": 503, "wizelens.expected": true });
    }
    expect((await serverOf("/down")).status).toBe("error");
  });
});

describe("koa", () => {
  it("captures requests and serves the dashboard", async () => {
    const wl = make("koa-api");
    const app = new Koa();
    const router = new Router();
    router.get("/items/:id", (ctx) => void (ctx.body = lookup(wl)));
    router.get("/boom", () => {
      throw new Error("boom");
    });
    app.silent = true;
    app.use(wizelensKoa(wl));
    app.use(router.routes());
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    closers.push(() => new Promise((r) => server.close(r)));
    await check(wl, baseOf(server), true);
  });
});

describe("hono", () => {
  it("captures requests and serves the dashboard", async () => {
    const wl = make("hono-api");
    const app = new Hono();
    app.use(wizelensHono(wl));
    app.get("/items/:id", (c) => c.json(lookup(wl)));
    app.get("/boom", () => {
      throw new Error("boom");
    });
    const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }) as Server;
    await new Promise((r) => server.once("listening", r));
    closers.push(() => new Promise((r) => server.close(r)));
    await check(wl, baseOf(server), false);
  });
});
