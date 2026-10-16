import { useEffect, useState } from "react";
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
