import { TIMING_ENDPOINT, TIMING_TRACE } from "@wizeworks/lens-core";

/** The server trace of this page's document, from its Server-Timing header. */
export interface DocumentTrace {
  traceId: string;
  /** The WizeLens endpoint of the server that rendered the page, when it sent one. */
  endpoint: string | null;
}

/** Read the trace id and endpoint a WizeLens server put in the document's Server-Timing. Null when there are none. */
export function documentTrace(): DocumentTrace | null {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const entries = nav?.serverTiming ?? [];
    const traceId = entries.find((e) => e.name === TIMING_TRACE)?.description ?? "";
    if (!/^[0-9a-f]{32}$/.test(traceId)) return null;
    return { traceId, endpoint: entries.find((e) => e.name === TIMING_ENDPOINT)?.description || null };
  } catch {
    return null;
  }
}
