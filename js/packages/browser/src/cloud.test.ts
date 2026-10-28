import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CLOUD_URL, cloudEndpoint, dashboardOf, isCloudBrowserEndpoint } from "./cloud.js";
import { createRecorder } from "./recorder.js";
import { scriptOptions } from "./script.js";
import { createSender } from "./sender.js";
import { span, stubPage } from "./test-env.js";

beforeEach(stubPage);
afterEach(() => vi.unstubAllGlobals());

const KEY = "wl_bk_abcdefghijklmnopqrstuvwx";
const tag = (attrs: Record<string, string>) => ({ getAttribute: (name: string) => attrs[name] ?? null });

it("builds the cloud endpoint for a browser key", () => {
  expect(cloudEndpoint(KEY)).toBe(`${CLOUD_URL}/_wizelens/b/${KEY}`);
  expect(cloudEndpoint(KEY, "https://lens.example.com/")).toBe(`https://lens.example.com/_wizelens/b/${KEY}`);
  expect(isCloudBrowserEndpoint(cloudEndpoint(KEY))).toBe(true);
  expect(isCloudBrowserEndpoint("https://api.test/_wizelens")).toBe(false);
});

it("posts to the cloud as plain text, so the browser makes no CORS check first", async () => {
  const types: string[] = [];
  const send = (async (_url: string, init?: RequestInit) => {
    types.push(String((init!.headers as Record<string, string>)["Content-Type"]));
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  for (const endpoint of [cloudEndpoint(KEY), "http://app.test/_wizelens"]) {
    const sender = createSender(endpoint, () => send);
    sender.push(span("1", "browser", "browser", 1));
    await sender.flush();
  }
  expect(types).toEqual(["text/plain;charset=UTF-8", "application/json"]);
});

it("reads nothing back from the cloud", async () => {
  const get = vi.fn(async () => new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", get);
  const recorder = createRecorder({ endpoint: cloudEndpoint(KEY), readServer: true });
  await recorder.restore();
  await recorder.loadServerStats("a".repeat(32));
  expect(get).not.toHaveBeenCalled();
});

it("starts a script tag with data-key on the cloud", () => {
  expect(scriptOptions(tag({ "data-key": KEY }))).toMatchObject({ endpoint: cloudEndpoint(KEY) });
  expect(scriptOptions(tag({ "data-key": KEY, "data-endpoint": "https://lens.example.com" }))).toMatchObject({ endpoint: cloudEndpoint(KEY, "https://lens.example.com") });
});

it("opens the cloud's dashboard from a browser key, and the endpoint's own otherwise", () => {
  expect(dashboardOf(cloudEndpoint("wl_bk_site", "http://localhost:5970"))).toBe("http://localhost:5970/_wizelens/");
  expect(dashboardOf("https://shop.test/_wizelens")).toBe("https://shop.test/_wizelens/");
});
