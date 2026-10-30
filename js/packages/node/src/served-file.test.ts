import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWizeLens, type WizeLens } from "./index.js";
import { isServedFile } from "./served-file.js";
import { getJson, type Running, settle, startApp } from "./test/helpers.js";

const root = mkdtempSync(join(tmpdir(), "wl-static-"));
const make = (traceStaticFiles?: boolean) => createWizeLens({ service: "shop-web", enabled: true, storage: "memory", instrumentFetch: false, traceStaticFiles });
const routes = (a: Parameters<Parameters<typeof startApp>[1]>[0]) => {
  a.use(express.static(root));
  a.get("/catalog", (_req, res) => res.json({ products: 12 }));
};
const roots = async (app: Running) => (await getJson<{ rootUrl: string }[]>(`${app.base}/_wizelens/api/traces?limit=50`)).map((t) => t.rootUrl).sort();
let skip: WizeLens;
let keep: WizeLens;
let off: Running;
let on: Running;

beforeAll(async () => {
  writeFileSync(join(root, "site.css"), "body { margin: 0; }");
  writeFileSync(join(root, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(root, "about.html"), "<html><body>Ashgrove &amp; Peña</body></html>");
  skip = make();
  keep = make(true);
  off = await startApp(skip, routes);
  on = await startApp(keep, routes);
});

afterAll(async () => {
  await Promise.all([off.close(), on.close(), skip.shutdown(), keep.shutdown()]);
  rmSync(root, { recursive: true, force: true });
});

describe("files served as they are", () => {
  it("are not traced, but pages, routes and missing files are", async () => {
    // eShop's home page brought 17 file requests, and the page itself was not on page 1 of Requests.
    for (const p of ["/site.css", "/logo.png", "/images/products/13.png", "/about.html", "/catalog"]) await fetch(off.base + p);
    await settle();
    expect(await roots(off)).toEqual(["/about.html", "/catalog", "/images/products/13.png"]);
  });

  it("are traced with traceStaticFiles", async () => {
    await fetch(on.base + "/site.css");
    await settle();
    expect(await roots(on)).toEqual(["/site.css"]);
  });

  it("are told apart by route, status, name and type", () => {
    expect(isServedFile("/js/site.js", undefined, 304, "application/javascript")).toBe(true);
    expect(isServedFile("/products/12", undefined, 200, "application/json")).toBe(false);
    expect(isServedFile("/report.pdf", "/report.pdf", 200, "application/pdf")).toBe(false);
    expect(isServedFile("/logo.png", undefined, 404, "text/plain")).toBe(false);
    expect(isServedFile("/index.html", undefined, 200, "text/html; charset=utf-8")).toBe(false);
  });
});
