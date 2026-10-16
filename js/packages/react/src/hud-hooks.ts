import { useCallback, useEffect, useState } from "react";
import { HUD_CSS } from "./hud-style.js";
import { createPageMonitor, EMPTY_PAGE_STATS, type PageStats } from "./page.js";

const STYLE_ID = "wizelens-hud-style";

export function useInjectedStyle(): void {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = HUD_CSS;
    document.head.appendChild(el);
  }, []);
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the setting lasts for this page only.
  }
}

/** A HUD setting kept in localStorage, so it survives a page refresh. */
export function useStored<T extends string>(key: string, fallback: T, valid: (v: string) => v is T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const v = readStored(key);
    return v !== null && valid(v) ? v : fallback;
  });
  const set = useCallback(
    (v: T) => {
      writeStored(key, v);
      setValue(v);
    },
    [key],
  );
  return [value, set];
}

const isFlag = (v: string): v is "1" | "0" => v === "1" || v === "0";

export function useFlag(key: string, fallback: boolean): [boolean, (on: boolean) => void] {
  const [v, set] = useStored(key, fallback ? "1" : "0", isFlag);
  return [v === "1", useCallback((on: boolean) => set(on ? "1" : "0"), [set])];
}

/** Start the monitor in an effect, so a StrictMode remount gets a fresh one. Buffered entries replay. */
export function usePageStats(): PageStats {
  const [stats, setStats] = useState(EMPTY_PAGE_STATS);
  useEffect(() => {
    const monitor = createPageMonitor();
    const sync = () => setStats(monitor.getSnapshot());
    sync();
    const unsubscribe = monitor.subscribe(sync);
    return () => {
      unsubscribe();
      monitor.stop();
    };
  }, []);
  return stats;
}

/** Call `onEscape` when Esc is pressed, while `active`. */
export function useEscape(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active || typeof addEventListener !== "function") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onEscape();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [active, onEscape]);
}
