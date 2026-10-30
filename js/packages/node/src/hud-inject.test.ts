import type { ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";
import { afterAll, describe, expect, it, vi } from "vitest";
import { closeServers, fetchPage, serveWith, tagOf } from "./test/hud.js";
import { createWizeLens } from "./wizelens.js";
import type { WizeLensOptions } from "./types.js";

vi.mock("./hud-bundle.js", async (importOriginal) => {
  const { fakeBundle } = await import("./test/hud.js");
  return { ...(await importOriginal<typeof import("./hud-bundle.js")>()), resolveHudBundle: () => fakeBundle() };
});

afterAll(closeServers);

const PAGE = "<!doctype html><html><head><title>Orders</title></head><body><h1>Orders</h1></body></html>";
const TAG = tagOf("hud-api");
const WITH_TAG = PAGE.replace("</body>", `${TAG}</body>`);
const make = (o: Partial<WizeLensOptions> = {}) =>
  createWizeLens({ service: "hud-api", enabled: true, dashboard: true, storage: "memory", instrumentFetch: false, captureConsole: false, ...o });
const html = (res: ServerResponse) => res.setHeader("Content-Type", "text/html; charset=utf-8");

async function page(app: (res: ServerResponse) => void, o: Partial<WizeLensOptions> = {}, init?: RequestInit, path = "/") {
  const base = await serveWith(make(o), (_req, res) => app(res));
  return fetchPage(`${base}${path}`, init);
}

describe("the HUD tag on HTML pages", () => {
  it("goes before </body> of a page sent in one chunk, with a Content-Length that fits", async () => {
    const got = await page((res) => (html(res), res.end(PAGE)));
    expect(got.text).toBe(WITH_TAG);
    expect(got.length).toBe(String(Buffer.byteLength(WITH_TAG)));
    const set = await page((res) => (html(res), res.setHeader("Content-Length", PAGE.length), res.end(PAGE)));
    expect(set.text).toBe(WITH_TAG);
    expect(set.length).toBe(String(Buffer.byteLength(WITH_TAG)));
  });

  it("finds a </body> split over two chunks", async () => {
    const got = await page((res) => {
      html(res);
      res.write("<html><body><p>a</p></bo");
      res.write("dy></html>");
      res.end();
    });
    expect(got.text).toBe(`<html><body><p>a</p>${TAG}</body></html>`);
  });

  it("drops a Content-Length set before streaming, and one passed to writeHead", async () => {
    const set = await page((res) => {
      html(res);
      res.setHeader("Content-Length", Buffer.byteLength(PAGE));
      res.write(PAGE.slice(0, 20));
      res.end(PAGE.slice(20));
    });
    expect(set.text).toBe(WITH_TAG);
    expect(set.length).toBeNull();
    const head = await page((res) => {
      res.writeHead(200, { "content-type": "text/html", "content-length": String(Buffer.byteLength(PAGE)) });
      res.write(PAGE);
      // Fastify ends with end(null, null, null) after writing the payload.
      (res.end as (...args: unknown[]) => void)(null, null, null);
    });
    expect(head.text).toBe(WITH_TAG);
    expect(head.length).toBeNull();
  });
});

describe("the HUD tag with any write", () => {
  it("reads writeHead headers given as a flat list", async () => {
    const got = await page((res) => res.writeHead(200, "OK", ["Content-Type", "text/html", "Content-Length", String(PAGE.length)]).end(PAGE));
    expect(got.text).toBe(WITH_TAG);
  });

  it("uses the last </body> in any case, once", async () => {
    const body = "<html><BODY><script>const s = '</body>';</script></BODY></html>";
    const got = await page((res) => (html(res), res.write(body.slice(0, 30)), res.end(body.slice(30))));
    expect(got.text).toBe(`<html><BODY><script>const s = '</body>';</script>${TAG}</BODY></html>`);
    expect(got.text.split("data-source").length).toBe(2);
  });

  it("takes strings with an encoding and Uint8Array chunks, and calls the callbacks", async () => {
    const done: string[] = [];
    const got = await page((res) => {
      html(res);
      res.write(Buffer.from("<html><body>é").toString("base64"), "base64", () => done.push("write"));
      res.write(new TextEncoder().encode("</body>"), () => done.push("bytes"));
      res.end("</html>", "utf8", () => done.push("end"));
    });
    expect(got.text).toBe(`<html><body>é${TAG}</body></html>`);
    expect(done).toEqual(["write", "bytes", "end"]);
  });
});

describe("error pages", () => {
  it("a 404 or a 500 page gets the tag: the HUD is wanted most on the page that failed", async () => {
    for (const status of [404, 500]) {
      const got = await page((res) => ((res.statusCode = status), html(res), res.end(PAGE)));
      expect(got.text).toBe(WITH_TAG);
    }
  });
});

describe("answers left as they are", () => {
  it("a gzip body", async () => {
    const zipped = gzipSync(PAGE);
    const got = await page((res) => res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip", "content-length": zipped.length }).end(zipped));
    expect(got.text).toBe(PAGE);
    expect(got.length).toBe(String(zipped.length));
  });

  it("JSON, a redirect page, and a fragment without </body>", async () => {
    const json = await page((res) => res.writeHead(200, { "content-type": "application/json" }).end('{"body":"</body>"}'));
    expect(json.text).toBe('{"body":"</body>"}');
    const moved = await page((res) => ((res.statusCode = 302), res.setHeader("Location", "/"), html(res), res.end(PAGE)), {}, { redirect: "manual" });
    expect(moved.text).toBe(PAGE);
    const fragment = await page((res) => (html(res), res.setHeader("Content-Length", 12), res.end("<li>one</li>")));
    expect(fragment.text).toBe("<li>one</li>");
    expect(fragment.length).toBe("12");
  });

  it("a HEAD and a POST", async () => {
    const app = (res: ServerResponse) => (html(res), res.setHeader("Content-Length", PAGE.length), res.end(PAGE));
    const head = await page(app, {}, { method: "HEAD" });
    expect(head.length).toBe(String(PAGE.length));
    expect((await page(app, {}, { method: "POST" })).text).toBe(PAGE);
  });

  it("the dashboard's own pages", async () => {
    const got = await page((res) => (html(res), res.end(PAGE)), {}, undefined, "/_wizelens/");
    expect(got.status).toBe(200);
    expect(got.text).not.toContain('data-source="inject"');
  });

  it("every page when hud is false, WIZELENS_HUD is false, or the dashboard is off", async () => {
    const app = (res: ServerResponse) => (html(res), res.end(PAGE));
    expect((await page(app, { hud: false })).text).toBe(PAGE);
    expect((await page(app, { dashboard: false })).text).toBe(PAGE);
    vi.stubEnv("WIZELENS_HUD", "false");
    try {
      expect((await page(app)).text).toBe(PAGE);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
