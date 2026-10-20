import type { Attributes } from "@wizeworks/lens-core";
import { pageMapLoader, sendError } from "./error-frames.js";
import { watchConsole } from "./console-capture.js";
import { errorSpan, toCapturedError, watchErrors } from "./errors.js";
import type { FrameworkHooks } from "./framework.js";
import { createPageViewTracker } from "./pageview-tracker.js";
import { watchRoutes } from "./routes.js";
import type { Sender } from "./sender.js";
import { now } from "./session.js";

export interface CaptureOptions {
  sender: Pick<Sender, "push" | "flush" | "log" | "hold" | "release">;
  sessionId: string;
  /** Copy `console.*` calls into the page view's trace. Default true. */
  captureConsole?: boolean;
  /** Read this page's source maps (dev servers serve them) so browser errors group by source. Default true. */
  resolveFrames?: boolean;
  /** Render stats and timings from a UI framework (React). Default none. */
  framework?: FrameworkHooks;
}

/** Running page capture: page views, errors, console lines, and framework render stats. */
export interface BrowserCapture {
  /** Start a route-change page view for `url` (default: the current location). Skipped when the path did not change. */
  pageView(url?: string): void;
  /** Send an error in the current page view's trace. `attributes` go on its span, for example the component that threw. */
  captureError(error: unknown, attributes?: Attributes): void;
  stop(): void;
}

const NOOP: BrowserCapture = { pageView: () => {}, captureError: () => {}, stop: () => {} };

/** Capture page views, framework renders, and browser errors. Does nothing outside a browser. */
export function createBrowserCapture(o: CaptureOptions): BrowserCapture {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof history === "undefined") return NOOP;
  const fw = o.framework;
  fw?.install?.();
  const views = createPageViewTracker({ push: (s) => o.sender.push(s), sessionId: o.sessionId, framework: fw });
  let reportedAt = now();
  const report = () => {
    const span = fw?.statsSpan?.(views.current(), reportedAt, o.sessionId) ?? null;
    reportedAt = now();
    if (span) o.sender.push(span);
  };
  const timer = fw?.statsSpan ? setInterval(report, fw.statsIntervalMs ?? 5000) : null;
  const maps = o.resolveFrames === false ? null : pageMapLoader();
  const send = (err: unknown, attributes?: Attributes) => {
    const span = errorSpan(views.current(), toCapturedError(err), o.sessionId);
    if (attributes) Object.assign(span.attributes, attributes);
    sendError(o.sender, span, maps);
  };
  const stopErrors = watchErrors((err) => sendError(o.sender, errorSpan(views.current(), err, o.sessionId), maps));
  const stopConsole = o.captureConsole === false ? () => {} : watchConsole(views.current, (l) => o.sender.log(l));
  const navigate = (url?: string) => views.willNavigate(url) && (report(), views.navigate(url));
  const stopRoutes = watchRoutes(() => navigate());
  const onHide = () => {
    report();
    views.finish();
    void o.sender.flush();
  };
  const onShow = (e: Event) => (e as PageTransitionEvent).persisted && views.restart();
  addEventListener("pagehide", onHide);
  addEventListener("pageshow", onShow);
  const stop = () => {
    if (timer) clearInterval(timer);
    report();
    views.stop();
    [stopErrors, stopConsole, stopRoutes].forEach((s) => s());
    removeEventListener("pagehide", onHide);
    removeEventListener("pageshow", onShow);
    void o.sender.flush();
  };
  return { pageView: (url) => void navigate(url), captureError: send, stop };
}

/** Capture page views, framework renders, and browser errors. Returns a stop function. */
export function startBrowserCapture(o: CaptureOptions): () => void {
  const capture = createBrowserCapture(o);
  return () => capture.stop();
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
