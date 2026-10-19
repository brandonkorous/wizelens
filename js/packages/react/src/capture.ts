import { ATTR_REACT_COMMITS, ATTR_REACT_COMPONENTS, newSpanId, type Span } from "@wizeworks/lens-core";
import { pageMapLoader, sendError } from "./error-frames.js";
import { browserSpan, type ViewRef } from "./browser-span.js";
import { watchConsole } from "./console-capture.js";
import { errorSpan, watchErrors } from "./errors.js";
import { topComponents } from "./fiber-stats.js";
import { createPageViewTracker } from "./pageview-tracker.js";
import { drainReactStats, installReactHook } from "./react-hook.js";
import { watchRoutes } from "./routes.js";
import type { Sender } from "./sender.js";
import { now } from "./session.js";

export interface CaptureOptions {
  sender: Pick<Sender, "push" | "flush" | "log" | "hold" | "release">;
  sessionId: string;
  /** Copy `console.*` calls into the page view's trace. Default true. */
  captureConsole?: boolean;
  /** How often React render stats are sent. Default 5000 ms. */
  reactIntervalMs?: number;
  /** Read this page's source maps (dev servers serve them) so browser errors group by source. Default true. */
  resolveFrames?: boolean;
}

/** A React render stats span for the components that rendered since the last report. Null when nothing rendered. */
export function reactStatsSpan(view: ViewRef, sinceMs: number, sessionId: string): Span | null {
  const { stats, commits } = drainReactStats();
  if (commits === 0) return null;
  const at = now();
  return browserSpan({
    type: "react",
    traceId: view.traceId,
    spanId: newSpanId(),
    parentSpanId: view.spanId,
    name: `react renders ${view.route}`,
    startMs: sinceMs,
    durationMs: at - sinceMs,
    sessionId,
    route: view.route,
    attributes: { [ATTR_REACT_COMMITS]: commits, [ATTR_REACT_COMPONENTS]: JSON.stringify(topComponents(stats)) },
  });
}

/** Capture page views, React renders, and browser errors. Returns a stop function. */
export function startBrowserCapture(o: CaptureOptions): () => void {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof history === "undefined") return () => {};
  installReactHook();
  const views = createPageViewTracker({ push: (s) => o.sender.push(s), sessionId: o.sessionId });
  let reportedAt = now();
  const report = () => {
    const span = reactStatsSpan(views.current(), reportedAt, o.sessionId);
    reportedAt = now();
    if (span) o.sender.push(span);
  };
  const timer = setInterval(report, o.reactIntervalMs ?? 5000);
  const maps = o.resolveFrames === false ? null : pageMapLoader();
  const stopErrors = watchErrors((err) => sendError(o.sender, errorSpan(views.current(), err, o.sessionId), maps));
  const stopConsole = o.captureConsole === false ? () => {} : watchConsole(views.current, (l) => o.sender.log(l));
  const stopRoutes = watchRoutes(() => {
    report();
    views.navigate();
  });
  const onHide = () => {
    report();
    views.finish();
    void o.sender.flush();
  };
  const onShow = (e: Event) => (e as PageTransitionEvent).persisted && views.restart();
  addEventListener("pagehide", onHide);
  addEventListener("pageshow", onShow);
  return () => {
    clearInterval(timer);
    report();
    views.stop();
    stopErrors();
    stopConsole();
    stopRoutes();
    removeEventListener("pagehide", onHide);
    removeEventListener("pageshow", onShow);
    void o.sender.flush();
  };
}

/** Starts capture once and keeps it through a quick stop and start (React StrictMode runs effects twice). */
export function createCaptureHandle(start: () => () => void): { acquire(): void; release(): void } {
  let stop: (() => void) | null = null;
  let pendingStop: ReturnType<typeof setTimeout> | null = null;
  return {
    acquire() {
      if (pendingStop) clearTimeout(pendingStop);
      pendingStop = null;
      stop ??= start();
    },
    release() {
      pendingStop = setTimeout(() => {
        stop?.();
        stop = null;
        pendingStop = null;
      }, 0);
    },
  };
}
