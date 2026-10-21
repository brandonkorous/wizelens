import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { serve } from "@hono/node-server";
import express from "express";
import Fastify from "fastify";
import { Hono } from "hono";
import Koa from "koa";
import { afterAll, describe, expect, it, vi } from "vitest";
import { fetchPage, TAG } from "../test/hud.js";
import { createWizeLens } from "../wizelens.js";
import { wizelensFastify } from "./fastify.js";
import { wizelensHono } from "./hono.js";
import { wizelensKoa } from "./koa.js";

vi.mock("../hud-bundle.js", async (importOriginal) => {
  const { fakeBundle } = await import("../test/hud.js");
  return { ...(await importOriginal<typeof import("../hud-bundle.js")>()), resolveHudBundle: () => fakeBundle() };
});

const PAGE = "<!doctype html><html><body><main>Shop</main></body></html>";
const WITH_TAG = PAGE.replace("</body>", `${TAG}</body>`);
const make = (name: string) => createWizeLens({ serviceName: name, enabled: true, dashboard: true, storage: "memory", instrumentFetch: false, captureConsole: false });
const closers: (() => Promise<unknown>)[] = [];
afterAll(async () => void (await Promise.all(closers.map((c) => c()))));

async function listening(server: Server): Promise<string> {
  if (!server.listening) await new Promise((r) => server.once("listening", r));
  closers.push(() => new Promise((r) => server.close(r)));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** The page gets the tag; JSON and the script itself come back as they were. */
async function check(base: string): Promise<void> {
  const page = await fetchPage(`${base}/page`);
  expect(page.text).toBe(WITH_TAG);
  expect(page.length === null || page.length === String(Buffer.byteLength(WITH_TAG))).toBe(true);
  expect((await fetchPage(`${base}/data`)).text).toBe('{"html":"</body>"}');
  const script = await fetchPage(`${base}/_wizelens/wizelens.js`);
  expect(script.type).toBe("application/javascript; charset=utf-8");
}

describe("the HUD on every framework", () => {
  it("express: res.send and a static file streamed with its Content-Length", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wl-hud-static-"));
    writeFileSync(join(dir, "index.html"), PAGE);
    const wl = make("hud-express");
    const app = express();
    app.use(wl.middleware);
    app.get("/page", (_req, res) => void res.send(PAGE));
    app.get("/data", (_req, res) => void res.json({ html: "</body>" }));
    app.use("/static", express.static(dir));
    const base = await listening(createServer(app).listen(0, "127.0.0.1"));
    await check(base);
    const file = await fetchPage(`${base}/static/index.html`);
    expect(file.text).toBe(WITH_TAG);
    expect(file.length).toBeNull();
  });

  it("fastify: writeHead with a Content-Length, then the payload", async () => {
    const app = Fastify();
    await app.register(wizelensFastify(make("hud-fastify")));
    app.get("/page", async (_req, reply) => reply.type("text/html").send(PAGE));
    app.get("/data", async () => ({ html: "</body>" }));
    await app.listen({ port: 0, host: "127.0.0.1" });
    closers.push(() => app.close());
    await check(await listening(app.server));
  });

  it("koa: a string body and a streamed one", async () => {
    const app = new Koa();
    app.silent = true;
    app.use(wizelensKoa(make("hud-koa")));
    app.use((ctx) => {
      if (ctx.path === "/data") ctx.body = { html: "</body>" };
      else if (ctx.path === "/page") ctx.body = PAGE;
      else if (ctx.path === "/stream") (ctx.type = "html"), (ctx.body = Readable.from([PAGE.slice(0, 40), PAGE.slice(40)]));
    });
    const base = await listening(app.listen(0, "127.0.0.1"));
    await check(base);
    expect((await fetchPage(`${base}/stream`)).text).toBe(WITH_TAG);
  });

  it("hono: c.html and c.json", async () => {
    const app = new Hono();
    app.use(wizelensHono(make("hud-hono")));
    app.get("/page", (c) => c.html(PAGE));
    app.get("/data", (c) => c.json({ html: "</body>" }));
    await check(await listening(serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }) as Server));
  });
});
