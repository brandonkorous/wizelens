import { type Attributes, ATTR_BROWSER_NAVIGATION, ATTR_BROWSER_REMOTE, ATTR_PAGE, newSpanId, newTraceId, pathShape, type Span } from "@wizeworks/lens-core";
import { browserSpan, round1, type ViewRef } from "./browser-span.js";
import type { ImageInfo } from "./images.js";
import { clsFromShifts, type NavPoints, type Shift } from "./vitals.js";

/** One page view: a full load or a client-side route change. Times are ms from navigation start. */
export interface PageView extends ViewRef {
  navigation: "load" | "spa";
  /** The path the view is for, "/products/42". A route change to the same path is not a new view. */
  path: string;
  /** Epoch ms. */
  startMs: number;
  /** ms from navigation start. 0 for a full load. */
  startRel: number;
  /** A page shown again from the back-forward cache: no navigation timings. */
  bfcache: boolean;
  shifts: Shift[];
  fcpMs: number | null;
  lcpMs: number | null;
  inpMs: number | null;
  hydrationMs: number | null;
  /** Route change to the next paint after the framework rendered it. Spa views only. */
  renderMs: number | null;
  /** The WizeLens endpoint of the server that rendered this page. Full loads only. */
  remote: string | null;
  sent: boolean;
}

// `url` (default: the current location) resolved against the page. No page and no url: path "/" and an empty href.
function resolveUrl(url?: string): { path: string; href: string } {
  const page = typeof location !== "undefined" ? location.href : null;
  if (url === undefined && page === null) return { path: "/", href: "" };
  try {
    const u = new URL(url ?? page!, page ?? "http://localhost/");
    return { path: u.pathname, href: u.href };
  } catch {
    return { path: url ?? "/", href: url ?? "" };
  }
}

/** The path of `url` (default: the current location), "/products/42". */
export const pathOf = (url?: string): string => resolveUrl(url).path;

/** A new view of `url` (default: the current location). A router in hash mode passes its own path here. */
export function newPageView(navigation: PageView["navigation"], startRel: number, bfcache = false, url?: string): PageView {
  const { path, href } = resolveUrl(url);
  return {
    traceId: newTraceId(),
    spanId: newSpanId(),
    route: pathShape(path),
    url: href,
    navigation,
    path,
    startMs: (typeof performance !== "undefined" ? performance.timeOrigin : Date.now()) + startRel,
    startRel,
    bfcache,
    shifts: [],
    fcpMs: null,
    lcpMs: null,
    inpMs: null,
    hydrationMs: null,
    renderMs: null,
    remote: null,
    sent: false,
  };
}

function loadTimings(nav: NavPoints, fcpMs: number | null): Attributes {
  return {
    [ATTR_PAGE.ttfbMs]: round1(nav.responseStart - nav.startTime),
    [ATTR_PAGE.ssrMs]: round1(nav.responseStart - nav.requestStart),
    [ATTR_PAGE.clientRenderMs]: fcpMs === null ? null : round1(Math.max(0, fcpMs - nav.responseEnd)),
    [ATTR_PAGE.loadMs]: nav.loadEventEnd > 0 ? round1(nav.loadEventEnd - nav.startTime) : null,
  };
}

/** How long the view took to show: LCP (else the load event) for a load, the measured render for a route change. */
export function viewRenderMs(view: PageView, nav: NavPoints | null): number | null {
  if (view.navigation === "spa") return view.renderMs;
  if (view.lcpMs !== null) return view.lcpMs;
  return nav && nav.loadEventEnd > 0 ? nav.loadEventEnd - nav.startTime : null;
}

/** Contract attributes of a page view span. Unknown values are left out. */
export function pageViewAttributes(view: PageView, nav: NavPoints | null, images: ImageInfo): Attributes {
  const load = view.navigation === "load";
  const all: Attributes = {
    [ATTR_BROWSER_NAVIGATION]: view.navigation,
    [ATTR_BROWSER_REMOTE]: view.remote,
    "url.full": view.url,
    ...(load && nav ? loadTimings(nav, view.fcpMs) : {}),
    [ATTR_PAGE.fcpMs]: load ? round1(view.fcpMs) : null,
    [ATTR_PAGE.lcpMs]: load ? round1(view.lcpMs) : null,
    [ATTR_PAGE.cls]: Math.round(clsFromShifts(view.shifts) * 1000) / 1000,
    [ATTR_PAGE.inpMs]: round1(view.inpMs),
    [ATTR_PAGE.hydrationMs]: load ? round1(view.hydrationMs) : null,
    [ATTR_PAGE.renderMs]: round1(viewRenderMs(view, nav)),
    [ATTR_PAGE.imageMs]: round1(images.slowestMs),
    [ATTR_PAGE.images]: images.count,
    [ATTR_PAGE.largeImages]: images.large,
  };
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v !== null && v !== undefined));
}

export function pageViewSpan(view: PageView, nav: NavPoints | null, images: ImageInfo, sessionId: string): Span {
  return browserSpan({
    type: "pageview",
    traceId: view.traceId,
    spanId: view.spanId,
    parentSpanId: null,
    name: `pageview ${view.route}`,
    startMs: view.startMs,
    durationMs: viewRenderMs(view, nav) ?? 0,
    sessionId,
    route: view.route,
    attributes: pageViewAttributes(view, nav, images),
  });
}
