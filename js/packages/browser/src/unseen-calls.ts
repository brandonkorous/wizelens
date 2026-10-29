import { TIMING_ENDPOINT, TIMING_TRACE } from "@wizeworks/lens-core";
import type { RecordedRequest } from "./recorder-types.js";
import { pathOf } from "./requests.js";
import { observe } from "./vitals.js";

type Resource = PerformanceResourceTiming & { responseStatus?: number };

/** A call fetch and XHR patches did not see, with the server trace and endpoint its Server-Timing named. */
export interface UnseenCall {
  row: RecordedRequest;
  endpoint: string | null;
}

const timingOf = (entry: Resource, name: string): string => entry.serverTiming?.find((t) => t.name === name)?.description ?? "";

// A fetch (or XHR, when `xhr`) a WizeLens server traced, that is not a call to WizeLens itself.
function traced(entry: Resource, endpoint: URL, xhr: boolean): boolean {
  if (entry.initiatorType !== "fetch" && !(xhr && entry.initiatorType === "xmlhttprequest")) return false;
  if (!/^[0-9a-f]{32}$/.test(timingOf(entry, TIMING_TRACE))) return false;
  try {
    return !(new URL(entry.name).pathname + "/").startsWith(endpoint.pathname.replace(/\/*$/, "/"));
  } catch {
    return false;
  }
}

/** A HUD row for one resource timing entry, or null when no WizeLens server traced it. The method is not in resource timing: the server's name for the call gives it. */
export function unseenCall(entry: Resource, endpoint: URL, base: string, xhr = true): UnseenCall | null {
  if (!traced(entry, endpoint, xhr)) return null;
  const traceId = timingOf(entry, TIMING_TRACE);
  const row: RecordedRequest = {
    id: `early-${traceId}`, method: "", url: entry.name, path: pathOf(entry.name, base), status: entry.responseStatus || null,
    durationMs: Math.max(0, entry.responseStart - entry.startTime), renderMs: null, traceId, profiled: true,
    startMs: performance.timeOrigin + entry.startTime, error: null,
  };
  return { row, endpoint: timingOf(entry, TIMING_ENDPOINT) || null };
}

/** Calls back with each traced call in the browser's resource timing, the ones before this started too. A page's own script can call fetch before WizeLens patches it (an inline script, a bundle that runs first, the moment before start). Returns a stop function. */
export function watchCalls(endpoint: URL, base: string, xhr: boolean, onCall: (call: UnseenCall) => void): () => void {
  if (typeof performance === "undefined") return () => {};
  return observe("resource", (entries) => {
    for (const e of entries) {
      const call = unseenCall(e as Resource, endpoint, base, xhr);
      if (call) onCall(call);
    }
  });
}
