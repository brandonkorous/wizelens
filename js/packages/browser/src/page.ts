import { clsFromShifts, type NavPoints, readNavigation, type Shift, watchVitals } from "./vitals.js";

export { clsFromShifts } from "./vitals.js";

/** Page load time and Web Vitals for the HUD. All values are null until the browser reports them. */
export interface PageStats {
  /** Navigation start to the end of the load event. */
  totalMs: number | null;
  /** Time the server took to send the first byte of the page. */
  serverMs: number | null;
  /** Redirects, DNS, connect, TLS, and the download of the page. */
  networkMs: number | null;
  /** End of the download to the end of the load event: parse, scripts, styles. */
  browserMs: number | null;
  /** Largest Contentful Paint. */
  lcpMs: number | null;
  /** Slowest interaction so far. A close match to Interaction to Next Paint for a dev session. */
  inpMs: number | null;
  /** Cumulative Layout Shift (largest session window). */
  cls: number | null;
}

export interface PageMonitor {
  subscribe(listener: () => void): () => void;
  getSnapshot(): PageStats;
  stop(): void;
}

export const EMPTY_PAGE_STATS: PageStats = {
  totalMs: null,
  serverMs: null,
  networkMs: null,
  browserMs: null,
  lcpMs: null,
  inpMs: null,
  cls: null,
};

/** Split a navigation entry into server, network, and browser time. Null until the load event ends. */
export function navigationBreakdown(nav: NavPoints): Pick<PageStats, "totalMs" | "serverMs" | "networkMs" | "browserMs"> | null {
  if (!nav.loadEventEnd) return null;
  const pos = (v: number) => Math.max(0, v);
  return {
    totalMs: pos(nav.loadEventEnd - nav.startTime),
    serverMs: pos(nav.responseStart - nav.requestStart),
    networkMs: pos(nav.requestStart - nav.startTime) + pos(nav.responseEnd - nav.responseStart),
    browserMs: pos(nav.loadEventEnd - nav.responseEnd),
  };
}

/** Live page stats for this tab, for the HUD. */
export function createPageMonitor(): PageMonitor {
  let stats = EMPTY_PAGE_STATS;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<PageStats>) => {
    stats = { ...stats, ...patch };
    listeners.forEach((l) => l());
  };
  if (typeof window === "undefined" || typeof performance === "undefined") {
    return { subscribe: () => () => {}, getSnapshot: () => stats, stop: () => {} };
  }
  const readNav = () => {
    const nav = readNavigation();
    const parts = nav && navigationBreakdown(nav);
    if (parts) set(parts);
  };
  // loadEventEnd is set after the load handlers return, so read it on the next tick.
  const onLoad = () => setTimeout(readNav, 0);
  if (document.readyState === "complete") readNav();
  else addEventListener("load", onLoad, { once: true });
  const shifts: Shift[] = [];
  const stopVitals = watchVitals({
    lcp: (t) => set({ lcpMs: t }),
    shift: (s) => {
      shifts.push(s);
      set({ cls: clsFromShifts(shifts) });
    },
    interaction: (_t, d) => d > (stats.inpMs ?? 0) && set({ inpMs: d }),
  });
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => stats,
    stop() {
      removeEventListener("load", onLoad);
      stopVitals();
    },
  };
}
