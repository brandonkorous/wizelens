import type { RecordedRequest } from "./recorder-types.js";
import { documentTrace } from "./server-timing.js";
import { observe } from "./vitals.js";

type Navigation = PerformanceNavigationTiming & { responseStatus?: number };

// When the page painted first, or null before it has.
function firstPaintMs(nav: Navigation): number | null {
  const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
  if (fcp !== undefined) return fcp;
  return nav.domContentLoadedEventEnd > 0 ? nav.domContentLoadedEventEnd : null;
}

const DOCUMENT_ID = "document-";

/** True for the HUD row of the request that rendered this page. */
export const isDocument = (r: RecordedRequest) => r.id.startsWith(DOCUMENT_ID);

/** The request that loaded this page, from the browser's navigation timing. Linked to its server trace when a WizeLens server traced it. */
export function pageLoadRequest(): RecordedRequest | null {
  if (typeof performance === "undefined" || typeof location === "undefined") return null;
  const nav = performance.getEntriesByType?.("navigation")[0] as Navigation | undefined;
  if (!nav) return null;
  const doc = documentTrace();
  const paint = firstPaintMs(nav);
  return {
    id: `${DOCUMENT_ID}${doc?.traceId ?? "page"}`,
    method: "GET",
    url: location.href,
    path: location.pathname + location.search,
    status: nav.responseStatus || 200,
    durationMs: Math.max(0, nav.responseStart - nav.startTime),
    renderMs: paint === null ? null : Math.max(0, paint - nav.responseStart),
    traceId: doc?.traceId ?? "",
    profiled: !!doc,
    startMs: performance.timeOrigin + nav.startTime,
    error: null,
  };
}

/** The request that rendered this page, as a HUD row, when a WizeLens server traced it (its Server-Timing). */
export const documentRequest = (): RecordedRequest | null => (documentTrace() ? pageLoadRequest() : null);

/** Calls back once with the page's render time (first paint after the first byte) when the browser reports its first paint. Returns a stop function. */
export function whenPainted(callback: (renderMs: number) => void): () => void {
  const nav = (typeof performance === "undefined" ? undefined : performance.getEntriesByType?.("navigation")[0]) as Navigation | undefined;
  if (!nav) return () => {};
  let done = false;
  let stop = () => {};
  stop = observe("paint", (entries) => {
    const fcp = entries.find((e) => e.name === "first-contentful-paint");
    if (!fcp || done) return;
    done = true;
    stop();
    callback(Math.max(0, fcp.startTime - nav.responseStart));
  });
  return () => stop();
}
