import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearPage, type StubbedPage, stubPage } from "./test-page.js";

type Angular = typeof import("./index.js");
const QUIET = { capturePages: false, captureConsole: false, resolveFrames: false };
let ng: Angular;
let page: StubbedPage;

const settle = () => new Promise((r) => setTimeout(r, 5));
const asked = (part: string) => page.urls.filter((u) => u.includes(part));
const router = { events: { subscribe: () => ({ unsubscribe() {} }) } };

beforeEach(async () => {
  page = stubPage();
  vi.resetModules();
  ng = await import("./index.js");
});
afterEach(async () => {
  await ng.currentWizeLens()?.shutdown();
  clearPage();
});

it("shows the HUD when the ErrorHandler provider starts WizeLens with hud: true and slowMs", async () => {
  ng.createWizeLensErrorHandler({ ...QUIET, hud: true, slowMs: 900 });
  expect(page.huds.map((h) => h.slowMs)).toEqual([900]);
  await settle();
  expect(asked("/api/info")).toEqual([]);
  expect(asked("/api/traces?session=")).toHaveLength(1);
});

it("asks the server's read API first by default, and shows the HUD when it answers", async () => {
  ng.trackAngularRouter(router, QUIET);
  expect(page.huds).toHaveLength(0);
  await settle();
  expect(asked("/api/info")).toHaveLength(1);
  expect(page.huds).toHaveLength(1);
});

it("shows nothing and reads nothing with hud: false", async () => {
  ng.createWizeLensErrorHandler({ ...QUIET, hud: false });
  await settle();
  expect(asked("/api/")).toEqual([]);
  expect(page.huds).toHaveLength(0);
});
