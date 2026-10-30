import { TIMING_ENDPOINT, TIMING_START, TIMING_TRACE } from "@wizeworks/lens-core/internal";

/** The server trace of this page's document, from its Server-Timing header. */
export interface DocumentTrace {
  traceId: string;
  /** The WizeLens endpoint of the server that rendered the page, when it sent one. */
  endpoint: string | null;
}

/** A page opened this long after its server answered is a cached copy (a crawler, a restored tab): it starts its own trace. */
const STALE_MS = 5 * 60_000;

/** A document from a cache, or one the server answered long before this page opened. */
function isStale(nav: PerformanceNavigationTiming, entries: readonly PerformanceServerTiming[]): boolean {
  if (nav.transferSize === 0) return true;
  const start = Number(entries.find((e) => e.name === TIMING_START)?.description);
  return start > 0 && performance.timeOrigin > start + STALE_MS;
}

/** Read the trace id and endpoint a WizeLens server put in the document's Server-Timing. Null when there are none or the document is stale. */
export function documentTrace(): DocumentTrace | null {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const entries = nav?.serverTiming ?? [];
    const traceId = entries.find((e) => e.name === TIMING_TRACE)?.description ?? "";
    if (!/^[0-9a-f]{32}$/.test(traceId) || isStale(nav!, entries)) return null;
    return { traceId, endpoint: entries.find((e) => e.name === TIMING_ENDPOINT)?.description || null };
  } catch {
    return null;
  }
}
