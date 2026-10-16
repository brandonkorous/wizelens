import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { Hud } from "./Hud.js";
import { readStored, resetStoredMemory, writeStored } from "./hud-storage.js";
import { createRecorder } from "./recorder.js";
import { stubPage } from "./test-env.js";

const local = new Map<string, string>();

beforeEach(() => {
  stubPage();
  local.clear();
  resetStoredMemory();
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

it("renders the same server HTML whatever is stored, so hydration matches", () => {
  const fresh = render();
  local.set("wizelens.hud.min", "1");
  local.set("wizelens.hud.panel", "details");
  local.set("wizelens.hud.live", "0");
  expect(render()).toBe(fresh);
});

it("keeps the minimized setting for after a refresh", () => {
  writeStored("wizelens.hud.min", "1");
  expect(local.get("wizelens.hud.min")).toBe("1");
  resetStoredMemory();
  expect(readStored("wizelens.hud.min")).toBe("1");
});

it("keeps a setting for this page when storage is blocked", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  });
  expect(readStored("wizelens.hud.min")).toBeNull();
  writeStored("wizelens.hud.min", "1");
  expect(readStored("wizelens.hud.min")).toBe("1");
});
