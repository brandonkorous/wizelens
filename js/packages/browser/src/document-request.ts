import type { RecordedRequest } from "./recorder-types.js";
import { documentTrace } from "./server-timing.js";

type Navigation = PerformanceNavigationTiming & { responseStatus?: number };

// When the page painted first, or null before it has.
function firstPaintMs(nav: Navigation): number | null {
  const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
  if (fcp !== undefined) return fcp;
  return nav.domContentLoadedEventEnd > 0 ? nav.domContentLoadedEventEnd : null;
}

/** The request that rendered this page, as a HUD row, when a WizeLens server traced it (its Server-Timing). */
export function documentRequest(): RecordedRequest | null {
  const doc = documentTrace();
  if (!doc || typeof performance === "undefined" || typeof location === "undefined") return null;
  const nav = performance.getEntriesByType("navigation")[0] as Navigation | undefined;
  if (!nav) return null;
  const paint = firstPaintMs(nav);
  return {
    id: `document-${doc.traceId}`,
    method: "GET",
    url: location.href,
    path: location.pathname + location.search,
    status: nav.responseStatus || 200,
    durationMs: Math.max(0, nav.responseStart - nav.startTime),
    renderMs: paint === null ? null : Math.max(0, paint - nav.responseStart),
    traceId: doc.traceId,
    profiled: true,
    startMs: performance.timeOrigin + nav.startTime,
    error: null,
  };
}
