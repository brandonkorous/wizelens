import type { Span } from "@wizeworks/lens-core/internal";
import type { FrameworkHooks } from "./framework.js";
import { imageStats, watchImages } from "./images.js";
import { afterNextPaint } from "./paint.js";
import { newPageView, type PageView, pageViewSpan, pathOf } from "./pageview.js";
import { documentTrace } from "./server-timing.js";
import { now } from "./session.js";
import { readNavigation, watchVitals } from "./vitals.js";

export interface PageViewTracker {
  current(): PageView;
  /** True when `url` (default: the current location) has another path than the current view. */
  willNavigate(url?: string): boolean;
  /** The path changed: send the current view and start a route-change view for `url` (default: the current location). */
  navigate(url?: string): void;
  /** Send the current view (once). */
  finish(): void;
  /** The page came back from the back-forward cache. */
  restart(): void;
  stop(): void;
}

interface LoadClaim {
  origin: number;
  traceId: string;
  spanId: string;
}
const CLAIM_KEY = "__wizelensLoadView";

/** The full-load view of this page. It joins the server's trace of the document. A later tracker on the same page joins it and does not send it again. */
export function loadView(): PageView {
  const doc = documentTrace();
  const view = { ...newPageView("load", 0), ...(doc && { traceId: doc.traceId, remote: doc.endpoint }) };
  const g = globalThis as { [CLAIM_KEY]?: LoadClaim };
  const origin = typeof performance !== "undefined" ? performance.timeOrigin : 0;
  const claim = g[CLAIM_KEY];
  if (claim?.origin === origin) return { ...view, traceId: claim.traceId, spanId: claim.spanId, sent: true };
  g[CLAIM_KEY] = { origin, traceId: view.traceId, spanId: view.spanId };
  return view;
}

// A route change waits at most this long for the framework to render the new page.
const COMMIT_WAIT_MS = 1000;

async function measureRouteRender(view: PageView, framework: FrameworkHooks | undefined): Promise<void> {
  await framework?.waitForRender?.(COMMIT_WAIT_MS);
  const paintedAt = await afterNextPaint();
  if (paintedAt !== null && !view.sent) view.renderMs = paintedAt - view.startMs;
}

/** Tracks page views and their timings, and sends one pageview span per view. */
export function createPageViewTracker(o: { push(span: Span): void; sessionId: string; framework?: FrameworkHooks }): PageViewTracker {
  let view = loadView();
  const images = watchImages();
  const stopVitals = watchVitals({
    lcp: (t) => view.navigation === "load" && (view.lcpMs = t),
    fcp: (t) => view.navigation === "load" && (view.fcpMs = t),
    shift: (s) => s.startTime >= view.startRel && view.shifts.push(s),
    interaction: (t, d) => t >= view.startRel && (view.inpMs = Math.max(view.inpMs ?? 0, d)),
  });
  const finish = () => {
    if (view.sent) return;
    view.sent = true;
    if (view.navigation === "load") view.hydrationMs ??= o.framework?.firstRenderMs?.() ?? null;
    const nav = view.navigation === "load" && !view.bfcache ? readNavigation() : null;
    o.push(pageViewSpan(view, nav, imageStats(view.startRel, images.downloads()), o.sessionId));
  };
  const begin = (next: PageView) => {
    finish();
    view = next;
    if (next.navigation === "spa") void measureRouteRender(next, o.framework);
  };
  const rel = () => now() - performance.timeOrigin;
  return {
    current: () => view,
    willNavigate: (url) => pathOf(url) !== view.path,
    navigate: (url) => begin(newPageView("spa", rel(), false, url)),
    finish,
    restart: () => begin(newPageView("load", rel(), true)),
    stop() {
      finish();
      stopVitals();
      images.stop();
    },
  };
}
