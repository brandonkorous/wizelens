import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearPage, type StubbedPage, stubPage } from "./test-page.js";

type Svelte = typeof import("./index.js");
const QUIET = { capturePages: false, captureConsole: false, resolveFrames: false };
let svelte: Svelte;
let page: StubbedPage;

const settle = () => new Promise((r) => setTimeout(r, 5));
const asked = (part: string) => page.urls.filter((u) => u.includes(part));

beforeEach(async () => {
  page = stubPage();
  vi.resetModules();
  svelte = await import("./index.js");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await svelte.currentWizeLens()?.shutdown();
  clearPage();
});

it("shows the HUD from initWizeLens({ hud: true, slowMs }) in hooks.client.ts, and reads traces back", async () => {
  svelte.initWizeLens({ ...QUIET, hud: true, slowMs: 900 });
  expect(page.huds.map((h) => h.slowMs)).toEqual([900]);
  await settle();
  expect(asked("/api/info")).toEqual([]);
  expect(asked("/api/traces?session=")).toHaveLength(1);
});

it("asks the server's read API first by default, and shows the HUD when it answers", async () => {
  svelte.initWizeLens(QUIET);
  expect(page.huds).toHaveLength(0);
  await settle();
  expect(asked("/api/info")).toHaveLength(1);
  expect(page.huds).toHaveLength(1);
});

it("starts WizeLens with the HUD options given to handleError, the first time it runs", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const handle = svelte.createHandleError(undefined, { ...QUIET, hud: true, slowMs: 750 });
  expect(page.huds).toHaveLength(0);
  handle({ error: new Error("boom") });
  expect(page.huds.map((h) => h.slowMs)).toEqual([750]);
});

it("shows nothing and reads nothing with hud: false", async () => {
  svelte.initWizeLens({ ...QUIET, hud: false });
  await settle();
  expect(asked("/api/")).toEqual([]);
  expect(page.huds).toHaveLength(0);
});
