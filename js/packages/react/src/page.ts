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

type NavTiming = Pick<
  PerformanceNavigationTiming,
  "startTime" | "requestStart" | "responseStart" | "responseEnd" | "loadEventEnd"
>;

/** Split a navigation entry into server, network, and browser time. Null until the load event ends. */
export function navigationBreakdown(nav: NavTiming): Pick<PageStats, "totalMs" | "serverMs" | "networkMs" | "browserMs"> | null {
  if (!nav.loadEventEnd) return null;
  const pos = (v: number) => Math.max(0, v);
  return {
    totalMs: pos(nav.loadEventEnd - nav.startTime),
    serverMs: pos(nav.responseStart - nav.requestStart),
    networkMs: pos(nav.requestStart - nav.startTime) + pos(nav.responseEnd - nav.responseStart),
    browserMs: pos(nav.loadEventEnd - nav.responseEnd),
  };
}

/** CLS: the largest burst of shifts, where a burst ends after a 1 s gap or at 5 s. */
export function clsFromShifts(shifts: readonly { startTime: number; value: number }[]): number {
  let best = 0;
  let sum = 0;
  let first = 0;
  let last = 0;
  for (const s of shifts) {
    if (sum > 0 && (s.startTime - last > 1000 || s.startTime - first > 5000)) sum = 0;
    if (sum === 0) first = s.startTime;
    sum += s.value;
    last = s.startTime;
    best = Math.max(best, sum);
  }
  return best;
}

function observe(type: string, onEntries: (entries: PerformanceEntryList) => void, extra: object = {}): () => void {
  try {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return () => {};
    const po = new PerformanceObserver((list) => onEntries(list.getEntries()));
    po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
    return () => po.disconnect();
  } catch {
    return () => {};
  }
}

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
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const parts = nav && navigationBreakdown(nav);
    if (parts) set(parts);
  };
  // loadEventEnd is set after the load handlers return, so read it on the next tick.
  const onLoad = () => setTimeout(readNav, 0);
  if (document.readyState === "complete") readNav();
  else addEventListener("load", onLoad, { once: true });

  // Paints in a hidden tab come late and say nothing about the page, so LCP ignores them.
  let firstHidden = document.visibilityState === "hidden" ? 0 : Infinity;
  const onHide = () => {
    if (document.visibilityState === "hidden") firstHidden = Math.min(firstHidden, performance.now());
  };
  addEventListener("visibilitychange", onHide, true);

  const shifts: { startTime: number; value: number }[] = [];
  const stops = [
    observe("largest-contentful-paint", (entries) => {
      const last = entries.filter((e) => e.startTime < firstHidden).pop();
      if (last) set({ lcpMs: last.startTime });
    }),
    observe("layout-shift", (entries) => {
      for (const e of entries as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!e.hadRecentInput) shifts.push({ startTime: e.startTime, value: e.value });
      }
      set({ cls: clsFromShifts(shifts) });
    }),
    observe(
      "event",
      (entries) => {
        let worst = stats.inpMs ?? 0;
        for (const e of entries as (PerformanceEntry & { interactionId?: number })[]) {
          if (e.interactionId) worst = Math.max(worst, e.duration);
        }
        if (worst > 0 && worst !== stats.inpMs) set({ inpMs: worst });
      },
      { durationThreshold: 16 },
    ),
  ];

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => stats,
    stop() {
      removeEventListener("load", onLoad);
      removeEventListener("visibilitychange", onHide, true);
      stops.forEach((s) => s());
    },
  };
}
