import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseTraceparent } from "@wizeworks/lens-core";
import { setBrowserUser } from "./browser-span.js";
import { asWizeLens, currentWizeLens, initWizeLens } from "./lens.js";
import { settle, spansOf, stubDom, stubServer } from "./test-dom.js";
import { type Call, postedSpans } from "./test-env.js";

const realFetch = globalThis.fetch;
const OPTIONS = { flushIntervalMs: 60_000, resolveFrames: false, captureConsole: false, hud: false };
let calls: Call[];

beforeEach(() => {
  stubDom();
  calls = stubServer();
});
afterEach(async () => {
  await currentWizeLens()?.shutdown();
  globalThis.fetch = realFetch;
  setBrowserUser(null);
  vi.unstubAllGlobals();
  delete (globalThis as { __wizelensLoadView?: unknown }).__wizelensLoadView;
});

it("does nothing when off or outside a page", async () => {
  const off = initWizeLens({ enabled: false });
  expect(off).toMatchObject({ enabled: false, recorder: null });
  expect(currentWizeLens()).toBeNull();
  vi.stubGlobal("window", undefined);
  const server = initWizeLens();
  server.captureError(new Error("x"));
  await server.shutdown();
  expect(server.enabled).toBe(false);
  expect(calls).toEqual([]);
});

it("traces fetch calls, reads nothing back without the HUD, and returns the running instance", async () => {
  const lens = initWizeLens(OPTIONS);
  expect(initWizeLens()).toBe(lens);
  expect(asWizeLens()).toBe(lens);
  expect(asWizeLens(lens)).toBe(lens);
  await fetch("/api/orders");
  await settle();
  await lens.flush();
  const call = calls.find((c) => c.url.includes("/api/orders"))!;
  const tp = parseTraceparent(new Headers(call.init?.headers).get("traceparent"))!;
  expect(spansOf(postedSpans(calls), "fetch")[0]).toMatchObject({ traceId: tp.traceId, name: "fetch /api/orders" });
  expect(calls.some((c) => c.url.includes("/api/traces"))).toBe(false);
});

it("sends one page view per path, from the History API or from pageView", async () => {
  const lens = initWizeLens(OPTIONS);
  history.pushState(null, "", "/products/42");
  lens.pageView("/products/42");
  lens.pageView("/products/42?tab=reviews");
  lens.pageView("/cart");
  await lens.shutdown();
  const views = spansOf(postedSpans(calls), "pageview");
  expect(views.map((s) => s.attributes["wizelens.browser.route"])).toEqual(["/page", "/products/{}", "/cart"]);
  expect(views.map((s) => s.attributes["wizelens.browser.navigation"])).toEqual(["load", "spa", "spa"]);
  expect(views[2]!.attributes["url.full"]).toBe("http://app.test/cart");
});

it("sends caught and uncaught errors in the page view's trace, with the user", async () => {
  const lens = initWizeLens({ ...OPTIONS, user: "u-1" });
  lens.setUser("u-7", { name: "Grace Hopper" });
  lens.captureError(new TypeError("boom"), { "vue.component": "Cart" });
  dispatchEvent(Object.assign(new Event("error"), { error: new RangeError("uncaught") }));
  await lens.shutdown();
  const spans = postedSpans(calls);
  const [view] = spansOf(spans, "pageview");
  const errors = spansOf(spans, "error");
  expect(errors.map((s) => s.name)).toEqual(["TypeError: boom", "RangeError: uncaught"]);
  expect(errors[0]).toMatchObject({ traceId: view!.traceId, parentSpanId: view!.spanId, status: "error" });
  expect(errors[0]!.attributes).toMatchObject({ "vue.component": "Cart", "enduser.id": "u-7", "user.full_name": "Grace Hopper" });
});

it("copies console lines into the page view's trace", async () => {
  const lens = initWizeLens({ ...OPTIONS, captureConsole: true });
  console.warn("low stock: %d", 3);
  await lens.shutdown();
  const posted = calls.filter((c) => c.url.endsWith("/api/client-spans")).flatMap((c) => JSON.parse(String(c.init!.body)).logs ?? []);
  expect(posted).toContainEqual(expect.objectContaining({ level: "warn", message: "low stock: 3", category: "console" }));
});

it("puts fetch back on shutdown, and starts again after", async () => {
  const mock = globalThis.fetch;
  const lens = initWizeLens(OPTIONS);
  expect(globalThis.fetch).not.toBe(mock);
  await lens.shutdown();
  expect(globalThis.fetch).toBe(mock);
  expect(currentWizeLens()).toBeNull();
  const again = asWizeLens(OPTIONS);
  expect(again).not.toBe(lens);
  expect(again.enabled).toBe(true);
});
