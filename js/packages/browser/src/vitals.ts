export interface Shift {
  startTime: number;
  value: number;
}

/** Navigation timing points in ms from navigation start. */
export interface NavPoints {
  startTime: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
  loadEventEnd: number;
  /** When a prerendered page was shown; 0 or absent for a page loaded as it was opened. */
  activationStart?: number;
}

export interface VitalHandlers {
  /** Largest Contentful Paint candidate, ms from navigation start. Paints in a hidden tab are skipped. */
  lcp?(startTime: number): void;
  /** First Contentful Paint, ms from navigation start. Skipped when the tab was hidden first. */
  fcp?(startTime: number): void;
  shift?(shift: Shift): void;
  /** An interaction (click, key press) and how long it took to paint the next frame. */
  interaction?(startTime: number, duration: number): void;
}

/** CLS: the largest burst of shifts, where a burst ends after a 1 s gap or at 5 s. */
export function clsFromShifts(shifts: readonly Shift[]): number {
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

/** The navigation entry of this page, or null before it exists. */
export function readNavigation(): NavPoints | null {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return null;
  return (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined) ?? null;
}

export function observe(type: string, onEntries: (entries: PerformanceEntryList) => void, extra: object = {}): () => void {
  try {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return () => {};
    const po = new PerformanceObserver((list) => onEntries(list.getEntries()));
    po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
    return () => po.disconnect();
  } catch {
    return () => {};
  }
}

/** When the page was first hidden, in ms from navigation start, or Infinity. Reads the browser record when it has one. */
export function firstHiddenAt(): number {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return 0;
  try {
    const hidden = performance.getEntriesByType("visibility-state").find((e) => e.name === "hidden");
    return hidden ? hidden.startTime : Infinity;
  } catch {
    return Infinity;
  }
}

type ShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean };
type EventEntry = PerformanceEntry & { interactionId?: number };

/** Watch paints, layout shifts, and interactions. Returns a stop function. */
export function watchVitals(h: VitalHandlers): () => void {
  if (typeof document === "undefined" || typeof addEventListener !== "function") return () => {};
  // Paints in a hidden tab come late and say nothing about the page.
  let firstHidden = firstHiddenAt();
  const onHide = () => {
    if (document.visibilityState === "hidden") firstHidden = Math.min(firstHidden, performance.now());
  };
  addEventListener("visibilitychange", onHide, true);
  const stops = [
    observe("largest-contentful-paint", (entries) => {
      const last = entries.filter((e) => e.startTime < firstHidden).pop();
      if (last) h.lcp?.(last.startTime);
    }),
    observe("paint", (entries) => {
      const fcp = entries.find((e) => e.name === "first-contentful-paint");
      if (fcp && fcp.startTime < firstHidden) h.fcp?.(fcp.startTime);
    }),
    observe("layout-shift", (entries) => {
      for (const e of entries as ShiftEntry[]) if (!e.hadRecentInput) h.shift?.({ startTime: e.startTime, value: e.value });
    }),
    observe("event", (entries) => {
      for (const e of entries as EventEntry[]) if (e.interactionId) h.interaction?.(e.startTime, e.duration);
    }, { durationThreshold: 16 }),
  ];
  return () => {
    removeEventListener("visibilitychange", onHide, true);
    stops.forEach((s) => s());
  };
}
