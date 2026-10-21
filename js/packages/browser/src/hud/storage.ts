// HUD settings in localStorage, under the keys the React HUD used, so a setting carries over.

/** The HUD shows small panels only. The full detail is the dashboard, in a new tab. */
export type Panel = "details" | "settings";

export const isPanel = (v: string): v is Panel => v === "details" || v === "settings";

export const HUD_KEYS = { panel: "wizelens.hud.panel", live: "wizelens.hud.live", min: "wizelens.hud.min" } as const;

export interface HudSettings {
  panel: Panel | "";
  live: boolean;
  minimized: boolean;
}

// Values written while storage is blocked, so a setting still lasts for this page.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export function readStored(key: string): string | null {
  const kept = memory.get(key);
  if (kept !== undefined) return kept;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the memory copy keeps the setting for this page.
  }
  for (const fn of listeners) fn();
}

/** Call `fn` when a HUD setting changes. Returns an undo function. */
export function subscribeStored(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

function readFlag(key: string, fallback: boolean): boolean {
  const v = readStored(key);
  return v === "1" ? true : v === "0" ? false : fallback;
}

/** The stored settings, with defaults for missing or unknown values. */
export function readSettings(): HudSettings {
  const panel = readStored(HUD_KEYS.panel) ?? "";
  return { panel: isPanel(panel) ? panel : "", live: readFlag(HUD_KEYS.live, true), minimized: readFlag(HUD_KEYS.min, false) };
}

export const writePanel = (panel: Panel | "") => writeStored(HUD_KEYS.panel, panel);
export const writeLive = (on: boolean) => writeStored(HUD_KEYS.live, on ? "1" : "0");
export const writeMinimized = (on: boolean) => writeStored(HUD_KEYS.min, on ? "1" : "0");

/** Test hook: forget values kept in memory. */
export function resetStoredMemory(): void {
  memory.clear();
}
