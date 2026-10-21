import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WizeLens as Lens } from "@wizeworks/lens-browser";
import { clearPage, type StubbedPage, stubPage } from "./test-page.js";

type Vue = typeof import("./index.js");
const QUIET = { capturePages: false, captureConsole: false, resolveFrames: false };
let vue: Vue;
let page: StubbedPage;

function install(options: Parameters<Vue["WizeLens"]["install"]>[1]): Lens {
  const provided = new Map<symbol, unknown>();
  vue.WizeLens.install({ config: {}, provide: (key, value) => provided.set(key, value) }, options);
  return provided.get(vue.WIZELENS_KEY) as Lens;
}

const settle = () => new Promise((r) => setTimeout(r, 5));
const asked = (part: string) => page.urls.filter((u) => u.includes(part));

beforeEach(async () => {
  page = stubPage();
  vi.resetModules();
  vue = await import("./index.js");
});
afterEach(async () => {
  await vue.currentWizeLens()?.shutdown();
  clearPage();
});

it("shows the HUD with app.use(WizeLens, { hud: true, slowMs }), and reads traces back", async () => {
  install({ ...QUIET, hud: true, slowMs: 900 });
  expect(page.huds.map((h) => h.slowMs)).toEqual([900]);
  await settle();
  expect(asked("/api/info")).toEqual([]);
  expect(asked("/api/traces?session=")).toHaveLength(1);
});

it("asks the server's read API first by default, and shows the HUD when it answers", async () => {
  install(QUIET);
  expect(page.huds).toHaveLength(0);
  await settle();
  expect(asked("/api/info")).toHaveLength(1);
  expect(page.huds).toHaveLength(1);
});

it("shows nothing and reads nothing with hud: false", async () => {
  install({ ...QUIET, hud: false });
  await settle();
  expect(asked("/api/")).toEqual([]);
  expect(page.huds).toHaveLength(0);
});
