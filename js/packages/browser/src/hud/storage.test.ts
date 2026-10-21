import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { stubLocalStorage } from "../test-hud.js";
import { HUD_KEYS, readSettings, readStored, resetStoredMemory, subscribeStored, writeLive, writeMinimized, writePanel, writeStored } from "./storage.js";

let local: Map<string, string>;

beforeEach(() => {
  local = stubLocalStorage();
});
afterEach(() => vi.unstubAllGlobals());

it("uses the React HUD's keys, so a setting carries over", () => {
  expect(HUD_KEYS).toEqual({ panel: "wizelens.hud.panel", live: "wizelens.hud.live", min: "wizelens.hud.min" });
});

it("starts live, with the full card and no panel, when nothing is stored", () => {
  expect(readSettings()).toEqual({ panel: "", live: true, minimized: false });
});

it("reads stored settings and ignores values it does not know", () => {
  local.set("wizelens.hud.panel", "details");
  local.set("wizelens.hud.live", "0");
  local.set("wizelens.hud.min", "1");
  expect(readSettings()).toEqual({ panel: "details", live: false, minimized: true });
  local.set("wizelens.hud.panel", "network");
  local.set("wizelens.hud.live", "yes");
  expect(readSettings()).toMatchObject({ panel: "", live: true });
});

it("keeps the minimized setting for after a refresh", () => {
  writeMinimized(true);
  expect(local.get("wizelens.hud.min")).toBe("1");
  resetStoredMemory();
  expect(readStored("wizelens.hud.min")).toBe("1");
});

it("keeps a setting for this page when storage is blocked", () => {
  const blocked = () => {
    throw new Error("blocked");
  };
  vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
  expect(readStored("wizelens.hud.min")).toBeNull();
  writeStored("wizelens.hud.min", "1");
  expect(readStored("wizelens.hud.min")).toBe("1");
  expect(readSettings().minimized).toBe(true);
});

it("tells subscribers about every write until they stop listening", () => {
  const seen = vi.fn();
  const off = subscribeStored(seen);
  writePanel("settings");
  writeLive(false);
  off();
  writeMinimized(true);
  expect(seen).toHaveBeenCalledTimes(2);
  expect(readSettings()).toEqual({ panel: "settings", live: false, minimized: true });
});
