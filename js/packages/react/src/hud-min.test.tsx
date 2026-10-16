import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { Hud } from "./Hud.js";
import { createRecorder } from "./recorder.js";
import { stubPage } from "./test-env.js";

const local = new Map<string, string>();

beforeEach(() => {
  stubPage();
  local.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => void local.set(k, v),
  });
});

const render = () => renderToString(<Hud recorder={createRecorder()} />);

it("shows the full card when nothing is stored", () => {
  const html = render();
  expect(html).toContain("wl-card");
  expect(html).not.toContain("wl-mini");
});

it("stays minimized to the icon after a refresh", () => {
  local.set("wizelens.hud.min", "1");
  const html = render();
  expect(html).toContain("wl-mini");
  expect(html).toContain('aria-label="Show WizeLens"');
  expect(html).not.toContain("wl-card");
});

it("ignores a damaged stored value", () => {
  local.set("wizelens.hud.min", "yes");
  expect(render()).toContain("wl-card");
});
