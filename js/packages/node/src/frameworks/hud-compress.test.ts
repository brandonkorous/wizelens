import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import fastifyCompress from "@fastify/compress";
import { serve } from "@hono/node-server";
import compression from "compression";
import express from "express";
import Fastify from "fastify";
import { Hono } from "hono";
import { compress as honoCompress } from "hono/compress";
import Koa from "koa";
import koaCompress from "koa-compress";
import { afterAll, describe, expect, it, vi } from "vitest";
import { tagOf } from "../test/hud.js";
import type { WizeLensOptions } from "../types.js";
import { createWizeLens } from "../wizelens.js";
import { wizeLensFastify } from "./fastify.js";
import { wizeLensHono } from "./hono.js";
import { wizeLensKoa } from "./koa.js";

vi.mock("../hud-bundle.js", async (importOriginal) => {
  const { fakeBundle } = await import("../test/hud.js");
  return { ...(await importOriginal<typeof import("../hud-bundle.js")>()), resolveHudBundle: () => fakeBundle() };
});

// Bigger than every compressing layer's 1 KB threshold.
const PAGE = `<!doctype html><html><body>${"<p>order line</p>".repeat(200)}</body></html>`;
const SCRIPT = `console.log(${JSON.stringify("x".repeat(4000))});`;
const SERVICE = "hud-gzip";
const make = (name: string, o: Partial<WizeLensOptions> = {}) =>
  createWizeLens({ service: name, enabled: true, dashboard: true, storage: "memory", instrumentFetch: false, captureConsole: false, ...o });
const closers: (() => Promise<unknown>)[] = [];
afterAll(async () => void (await Promise.all(closers.map((c) => c()))));

async function listening(server: Server): Promise<string> {
  if (!server.listening) await new Promise((r) => server.once("listening", r));
  closers.push(() => new Promise((r) => server.close(r)));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function get(url: string, accept: string) {
  const res = await fetch(url, { headers: { accept, "accept-encoding": "gzip" } });
  return { encoding: res.headers.get("content-encoding"), text: await res.text() };
}

/** A page navigation comes back plain with the tag; a script still comes back gzipped. */
async function check(base: string): Promise<void> {
  const page = await get(`${base}/page`, "text/html,application/xhtml+xml,*/*;q=0.8");
  expect(page.encoding).toBeNull();
  expect(page.text).toBe(PAGE.replace("</body>", `${tagOf(SERVICE)}</body>`));
  const script = await get(`${base}/app.js`, "*/*");
  expect(script.encoding).toBe("gzip");
  expect(script.text).toBe(SCRIPT);
}

function expressApp(o: Partial<WizeLensOptions> = {}, seen: string[] = []) {
  const wl = make(SERVICE, o);
  const app = express();
  app.use(wl.middleware);
  app.use(compression());
  app.get("/page", (req, res) => void (seen.push(String(req.headers["accept-encoding"])), res.type("html").send(PAGE)));
  app.get("/app.js", (_req, res) => void res.type("js").send(SCRIPT));
  app.get("/data", (_req, res) => void res.json({ items: SCRIPT }));
  return listening(createServer(app).listen(0, "127.0.0.1"));
}

describe("the HUD on pages a compressing layer would gzip", () => {
  it("express compression(): the page gets the tag, scripts and JSON still gzip", async () => {
    const base = await expressApp();
    await check(base);
    const data = await get(`${base}/data`, "application/json");
    expect(data.encoding).toBe("gzip");
    expect(JSON.parse(data.text)).toEqual({ items: SCRIPT });
  });

  it("leaves Accept-Encoding alone when hud is off", async () => {
    const seen: string[] = [];
    const base = await expressApp({ hud: false }, seen);
    const page = await get(`${base}/page`, "text/html");
    expect(page.encoding).toBe("gzip");
    expect(page.text).toBe(PAGE);
    expect(seen).toEqual(["gzip"]);
  });

  it("@fastify/compress", async () => {
    const app = Fastify();
    await app.register(wizeLensFastify(make(SERVICE)));
    await app.register(fastifyCompress, { global: true });
    app.get("/page", async (_req, reply) => reply.type("text/html").send(PAGE));
    app.get("/app.js", async (_req, reply) => reply.type("application/javascript").send(SCRIPT));
    await app.listen({ port: 0, host: "127.0.0.1" });
    closers.push(() => app.close());
    await check(await listening(app.server));
  });

  it("koa-compress", async () => {
    const app = new Koa();
    app.silent = true;
    app.use(wizeLensKoa(make(SERVICE)));
    app.use(koaCompress({ threshold: 1024 }));
    app.use((ctx) => {
      if (ctx.path === "/page") (ctx.type = "html"), (ctx.body = PAGE);
      if (ctx.path === "/app.js") (ctx.type = "js"), (ctx.body = SCRIPT);
    });
    await check(await listening(app.listen(0, "127.0.0.1")));
  });

  it("hono/compress", async () => {
    const app = new Hono();
    app.use(wizeLensHono(make(SERVICE)));
    app.use(honoCompress());
    app.get("/page", (c) => c.html(PAGE));
    app.get("/app.js", (c) => c.body(SCRIPT, 200, { "content-type": "application/javascript" }));
    await check(await listening(serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }) as Server));
  });
});
