import { ATTR_REACT_COMMITS, ATTR_REACT_COMPONENTS, newSpanId, type Span } from "@wizeworks/lens-core/internal";
import {
  browserSpan,
  type CaptureOptions as BrowserCaptureOptions,
  createRecorder as createBrowserRecorder,
  type FrameworkHooks,
  now,
  type Recorder,
  type RecorderOptions,
  startBrowserCapture as startCapture,
  type ViewRef,
} from "@wizeworks/lens-browser/internal";
import { topComponents } from "./fiber-stats.js";
import { drainReactStats, firstCommitMs, installReactHook, waitForCommit } from "./react-hook.js";

export interface ReactCaptureOptions extends BrowserCaptureOptions {
  /** How often React render stats are sent. Default 5000 ms. */
  reactIntervalMs?: number;
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

/** What React adds to browser capture: per-component render stats, hydration time, and the wait for a route change to render. */
export function reactFramework(statsIntervalMs = 5000): FrameworkHooks {
  return {
    install: () => void installReactHook(),
    statsSpan: reactStatsSpan,
    statsIntervalMs,
    firstRenderMs: firstCommitMs,
    waitForRender: waitForCommit,
  };
}

/** Capture page views, React renders, and browser errors. Returns a stop function. */
export function startReactCapture(o: ReactCaptureOptions): () => void {
  return startCapture({ ...o, framework: o.framework ?? reactFramework(o.reactIntervalMs) });
}

/** A recorder with React render capture. XHR calls are left alone, as before; pass `captureXhr: true` to trace them. */
export function createReactRecorder(options: RecorderOptions = {}): Recorder {
  return createBrowserRecorder({ framework: reactFramework(), captureXhr: false, ...options });
}
