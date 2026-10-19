import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ATTR_ERROR_FRAME, newSpanId, newTraceId, type ResolvedFrame } from "@wizeworks/lens-core";
import { CART_MAP, CART_MINIFIED, CART_STACK, CART_URL } from "../../core/src/testing/sourcemap.js";
import { dirMapLoader } from "./sourcemaps.js";
import { type Running, startApp } from "./test/helpers.js";
import { createWizeLens } from "./wizelens.js";

const dist = mkdtempSync(join(tmpdir(), "wl-maps-"));
mkdirSync(join(dist, "assets"));
writeFileSync(join(dist, "assets", "index-abc.js"), `${CART_MINIFIED}\n//# sourceMappingURL=index-abc.js.map`);
writeFileSync(join(dist, "assets", "index-abc.js.map"), CART_MAP);

// A dev server on this machine that serves the script with its map inline, as Vite does.
const dev = createServer((_req, res) => res.end(`${CART_MINIFIED}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(CART_MAP).toString("base64")}`));
await new Promise<void>((r) => dev.listen(0, "127.0.0.1", r));
const devUrl = `http://127.0.0.1:${(dev.address() as AddressInfo).port}/src/cart.ts`;

const wl = createWizeLens({ serviceName: "web", storage: "memory", instrumentFetch: false, sourceMaps: { dirs: [dist] } });
const app: Running = await startApp(wl, () => {});
afterAll(async () => (await app.close(), dev.close()));

const errorSpan = (traceId: string, stack: string) => ({
  traceId,
  spanId: newSpanId(),
  name: "Error: Coupon code is empty",
  category: "browser",
  status: "error",
  startMs: Date.now(),
  attributes: { "wizelens.browser.type": "error", "service.version": "1.0.0" },
  events: [{ name: "exception", timeMs: Date.now(), attributes: { "exception.type": "Error", "exception.message": "Coupon code is empty", "exception.stacktrace": stack } }],
});

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${app.base}/_wizelens/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("source maps in the add-on", () => {
  it("reads a build folder by the script path's tail", async () => {
    expect((await dirMapLoader([dist])(CART_URL, null))?.names).toEqual(["Error"]);
    expect(await dirMapLoader([dist])("https://app.test/../../etc/passwd", null)).toBeNull();
  });

  it("adds the group frame to browser errors as they arrive", async () => {
    const traceId = newTraceId();
    expect((await post("api/client-spans", { spans: [errorSpan(traceId, CART_STACK)] })).status).toBe(204);
    expect(wl.store.get(traceId)!.spans[0]!.events[0]!.attributes[ATTR_ERROR_FRAME]).toBe("src/cart.ts:applyCoupon");
  });

  it("resolves a dev server's stack with source lines, and says so in info", async () => {
    const stack = CART_STACK.replaceAll(CART_URL, devUrl);
    const res = await post("api/sourcemaps/resolve", { stack, release: "1.0.0" });
    const { frames } = (await res.json()) as { frames: ResolvedFrame[] };
    expect(frames[0]).toMatchObject({ source: "src/cart.ts", line: 3, fn: "applyCoupon" });
    expect(frames[0]!.context!.lines.join("\n")).toContain("throw new Error");
    expect((await post("api/sourcemaps/resolve", {})).status).toBe(400);
    const info = (await (await fetch(`${app.base}/_wizelens/api/info`)).json()) as { capabilities: string[] };
    expect(info.capabilities).toContain("sourcemaps");
  });
});
