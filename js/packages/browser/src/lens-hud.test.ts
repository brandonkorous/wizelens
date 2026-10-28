import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { settle, stubDom } from "./test-dom.js";
import { type Call, echoServer, urlOf } from "./test-env.js";
import { FakeElement, findAll, stubHudDom } from "./test-hud-dom.js";
import { stubLocalStorage } from "./test-hud.js";

type Lens = typeof import("./lens.js");
type Registry = typeof import("./registry.js");
const realFetch = globalThis.fetch;
const OPTIONS = { flushIntervalMs: 60_000, resolveFrames: false, captureConsole: false };
let lens: Lens;
let reg: Registry;
let body: FakeElement;
let calls: Call[];

const json = () => new Response('{"service":"api"}', { status: 200, headers: { "content-type": "application/json" } });

// A WizeLens server whose api/info answers with `info`; every other call echoes the trace id.
function serve(info: () => Response | Promise<Response>): void {
  calls = [];
  const echo = echoServer(calls);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!urlOf(input).endsWith("/api/info")) return echo(input, init);
    calls.push({ url: urlOf(input), init });
    return info();
  }) as typeof fetch;
}

beforeEach(async () => {
  stubDom();
  body = stubHudDom();
  stubLocalStorage();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.resetModules();
  lens = await import("./lens.js");
  reg = await import("./registry.js");
  serve(json);
});
afterEach(async () => {
  await lens.currentWizeLens()?.shutdown();
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("wizelens.browser")];
  delete (globalThis as { __wizelensLoadView?: unknown }).__wizelensLoadView;
  globalThis.fetch = realFetch;
  vi.unstubAllGlobals();
});

const huds = () => findAll(body, (el) => el.nodeName === "WIZELENS-HUD");
const urls = (part: string) => calls.filter((c) => c.url.includes(part)).map((c) => c.url);

it("asks nothing and reads nothing back with hud: false", async () => {
  lens.initWizeLens({ ...OPTIONS, hud: false });
  await settle();
  expect(urls("/api/info")).toEqual([]);
  expect(urls("/api/traces")).toEqual([]);
  expect(huds()).toHaveLength(0);
});

it("shows the HUD at once with hud: true, reads traces back, and takes it away on shutdown", async () => {
  const running = lens.initWizeLens({ ...OPTIONS, hud: true, slowMs: 900 });
  expect(huds()).toHaveLength(1);
  expect((huds()[0] as unknown as { slowMs: number }).slowMs).toBe(900);
  await settle();
  expect(urls("/api/info")).toEqual([]);
  expect(urls("/api/traces?session=")).toHaveLength(1);
  await running.shutdown();
  expect(huds()).toHaveLength(0);
});

it("asks {endpoint}/api/info once by default, for JSON, and shows the HUD when it answers", async () => {
  lens.initWizeLens({ ...OPTIONS, endpoint: "https://api.test/lens/" });
  expect(huds()).toHaveLength(0);
  await settle();
  expect(urls("/api/info")).toEqual(["https://api.test/lens/api/info"]);
  expect(new Headers(calls[0]!.init?.headers).get("accept")).toBe("application/json");
  expect(huds()).toHaveLength(1);
  expect(urls("https://api.test/lens/api/traces?session=")).toHaveLength(1);
});

it("stays hidden and send-only when the read API does not answer, or answers with a page", async () => {
  serve(() => new Response("Not found", { status: 404 }));
  const first = lens.initWizeLens(OPTIONS);
  await settle();
  expect(huds()).toHaveLength(0);
  expect(urls("/api/traces")).toEqual([]);
  await first.shutdown();
  serve(() => new Response("<!doctype html><title>App</title>", { status: 200, headers: { "content-type": "text/html" } }));
  lens.initWizeLens(OPTIONS);
  await settle();
  expect(huds()).toHaveLength(0);
  expect(urls("/api/traces")).toEqual([]);
});

it("shows the HUD in this browser only after ?wizelens-hud=on, keeps it on later pages, and hides it after off", async () => {
  const cloud = "https://lens.test/_wizelens/b/wl_bk_site";
  const first = lens.initWizeLens({ ...OPTIONS, endpoint: cloud });
  await settle();
  expect(huds()).toHaveLength(0);
  await first.shutdown();
  vi.stubGlobal("location", new URL("https://site.test/?wizelens-hud=on"));
  const mine = lens.initWizeLens({ ...OPTIONS, endpoint: cloud });
  await settle();
  expect(huds()).toHaveLength(1);
  expect(urls("/api/info")).toEqual([]);
  expect(urls("/api/traces")).toEqual([]);
  await mine.shutdown();
  vi.stubGlobal("location", new URL("https://site.test/contact"));
  const later = lens.initWizeLens({ ...OPTIONS, endpoint: cloud });
  expect(huds()).toHaveLength(1);
  await later.shutdown();
  vi.stubGlobal("location", new URL("https://site.test/?wizelens-hud=off"));
  lens.initWizeLens({ ...OPTIONS, endpoint: cloud });
  await settle();
  expect(huds()).toHaveLength(0);
});

it("lets readServer set by the caller win over the HUD", async () => {
  lens.initWizeLens({ ...OPTIONS, hud: true, readServer: false });
  await settle();
  expect(huds()).toHaveLength(1);
  expect(urls("/api/traces")).toEqual([]);
});

it("never shows the HUD when shut down before the probe answers", async () => {
  let answer: (r: Response) => void = () => {};
  serve(() => new Promise<Response>((r) => (answer = r)));
  const running = lens.initWizeLens(OPTIONS);
  await settle();
  await running.shutdown();
  answer(json());
  await settle();
  expect(huds()).toHaveLength(0);
});

it("registers every instance on the page and clears it on shutdown", async () => {
  const running = lens.initWizeLens({ ...OPTIONS, hud: false });
  expect(reg.registered()?.source).toBe("app");
  await running.shutdown();
  expect(reg.registered()).toBeNull();
});

it("stops an injected instance when the app starts, and takes over", async () => {
  const injected = lens.startWizeLens({ ...OPTIONS, hud: true }, "inject");
  expect(reg.registered()?.source).toBe("inject");
  const app = lens.initWizeLens({ ...OPTIONS, hud: true });
  expect(app).not.toBe(injected);
  expect(lens.currentWizeLens()).toBe(app);
  expect(reg.registered()?.source).toBe("app");
  expect(huds()).toHaveLength(1);
  await fetch("/api/orders");
  await settle();
  expect(app.recorder!.getSnapshot()).toHaveLength(1);
  expect(injected.recorder!.getSnapshot()).toHaveLength(0);
});

it("starts no injected instance while another one runs", () => {
  const app = lens.initWizeLens({ ...OPTIONS, hud: false });
  expect(lens.startWizeLens(OPTIONS, "inject")).toBe(app);
  reg.unregister(reg.registered()!);
  reg.register({ source: "app", stop: async () => {} });
  void app.shutdown();
  expect(lens.startWizeLens(OPTIONS, "inject").enabled).toBe(false);
  expect(lens.initWizeLens(OPTIONS).enabled).toBe(false);
});

it("stops an injected instance from another copy of the package", () => {
  const stop = vi.fn(async () => {});
  reg.register({ source: "inject", stop });
  const app = lens.initWizeLens({ ...OPTIONS, hud: false });
  expect(stop).toHaveBeenCalledOnce();
  expect(app.enabled).toBe(true);
  expect(reg.registered()?.source).toBe("app");
});
