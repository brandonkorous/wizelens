import type { Span } from "@wizeworks/lens-core";
import { imageStats } from "./images.js";
import { afterNextPaint } from "./paint.js";
import { newPageView, type PageView, pageViewSpan } from "./pageview.js";
import { firstCommitMs, waitForCommit } from "./react-hook.js";
import { now } from "./session.js";
import { readNavigation, watchVitals } from "./vitals.js";

export interface PageViewTracker {
  current(): PageView;
  /** The path changed: send the current view and start a route-change view. */
  navigate(): void;
  /** Send the current view (once). */
  finish(): void;
  /** The page came back from the back-forward cache. */
  restart(): void;
  stop(): void;
}

// A route change waits at most this long for React to render the new page.
const COMMIT_WAIT_MS = 1000;

async function measureRouteRender(view: PageView): Promise<void> {
  await waitForCommit(COMMIT_WAIT_MS);
  const paintedAt = await afterNextPaint();
  if (paintedAt !== null && !view.sent) view.renderMs = paintedAt - view.startMs;
}

/** Tracks page views and their timings, and sends one pageview span per view. */
export function createPageViewTracker(o: { push(span: Span): void; sessionId: string }): PageViewTracker {
  let view = newPageView("load", 0);
  const stopVitals = watchVitals({
    lcp: (t) => view.navigation === "load" && (view.lcpMs = t),
    fcp: (t) => view.navigation === "load" && (view.fcpMs = t),
    shift: (s) => s.startTime >= view.startRel && view.shifts.push(s),
    interaction: (t, d) => t >= view.startRel && (view.inpMs = Math.max(view.inpMs ?? 0, d)),
  });
  const finish = () => {
    if (view.sent) return;
    view.sent = true;
    if (view.navigation === "load") view.hydrationMs ??= firstCommitMs();
    const nav = view.navigation === "load" && !view.bfcache ? readNavigation() : null;
    o.push(pageViewSpan(view, nav, imageStats(view.startRel), o.sessionId));
  };
  const begin = (next: PageView) => {
    finish();
    view = next;
    if (next.navigation === "spa") void measureRouteRender(next);
  };
  const rel = () => now() - performance.timeOrigin;
  return {
    current: () => view,
    navigate: () => begin(newPageView("spa", rel())),
    finish,
    restart: () => begin(newPageView("load", rel(), true)),
    stop() {
      finish();
      stopVitals();
    },
  };
}
