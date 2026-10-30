import { afterEach, expect, it, vi } from "vitest";
import { newPageView, pathOf } from "./pageview.js";
import { registered } from "./registry.js";
import { scriptOptions } from "./script.js";
import { stubDom, stubServer } from "./test-dom.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
  vi.resetModules();
});

const tag = (attrs: Record<string, string>) => ({ getAttribute: (name: string) => attrs[name] ?? null });

it("reads options from the script tag's data attributes", () => {
  expect(scriptOptions(null)).toBeNull();
  expect(scriptOptions(tag({}))).toBeNull();
  expect(scriptOptions(tag({ "data-endpoint": "" }))).toMatchObject({ endpoint: undefined, enabled: true, captureConsole: true, captureXhr: true });
  expect(scriptOptions(tag({ "data-endpoint": "https://api.test/_wizelens", "data-release": "1.4.0", "data-console": "false", "data-enabled": "false" }))).toMatchObject({
    endpoint: "https://api.test/_wizelens",
    release: "1.4.0",
    captureConsole: false,
    enabled: false,
  });
});

it("starts on its own when loaded from a tag with data-endpoint", async () => {
  stubDom();
  stubServer();
  vi.stubGlobal("document", { ...document, currentScript: tag({ "data-endpoint": "/_wizelens" }) });
  const mod = await import("./script.js");
  const lens = mod.currentWizeLens();
  expect(lens?.enabled).toBe(true);
  expect(lens?.recorder?.endpointUrl).toBe("http://app.test/_wizelens");
  await lens?.shutdown();
});

it("shapes a view from the path a router passes, as for a hash router", () => {
  stubDom("http://app.test/#/orders/7");
  expect(pathOf()).toBe("/");
  expect(pathOf("/orders/7?tab=1")).toBe("/orders/7");
  expect(newPageView("spa", 10, false, "/orders/7")).toMatchObject({ route: "/orders/{}", path: "/orders/7", url: "http://app.test/orders/7" });
  expect(newPageView("load", 0)).toMatchObject({ route: "/", path: "/", url: "http://app.test/#/orders/7" });
});

it("reads the HUD, the slow mark, and who put the tag in the page", () => {
  expect(scriptOptions(tag({ "data-endpoint": "" }))).toMatchObject({ hud: "auto", slowMs: undefined, source: "app" });
  const injected = tag({ "data-endpoint": "/_wizelens", "data-hud": "true", "data-slow-ms": "800", "data-source": "inject" });
  expect(scriptOptions(injected)).toMatchObject({ hud: true, slowMs: 800, source: "inject" });
  expect(scriptOptions(tag({ "data-endpoint": "/x", "data-hud": "false", "data-slow-ms": "soon" }))).toMatchObject({ hud: false, slowMs: undefined });
  expect(scriptOptions(tag({ "data-endpoint": "/x", "data-hud": "maybe" }))?.hud).toBe("auto");
});

it("starts an injected tag after the page's load event, and gives way to a running instance", async () => {
  stubDom();
  stubServer();
  vi.stubGlobal("document", { ...document, readyState: "loading" });
  const mod = await import("./script.js");
  mod.startFromTag({ endpoint: "/_wizelens", hud: false, source: "inject" });
  expect(mod.currentWizeLens()).toBeNull();
  dispatchEvent(new Event("load"));
  expect(registered()?.source).toBe("inject");
  await mod.currentWizeLens()?.shutdown();
  vi.stubGlobal("document", { ...document, readyState: "complete" });
  const app = mod.initWizeLens({ hud: false });
  mod.startFromTag({ endpoint: "/_wizelens", hud: false, source: "inject" });
  expect(mod.currentWizeLens()).toBe(app);
  expect(registered()?.source).toBe("app");
  await app.shutdown();
  delete (globalThis as { __wizelensLoadView?: unknown }).__wizelensLoadView;
});
