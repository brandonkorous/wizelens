// Browser and background scenario traces: page views with React renders, a failed fetch, and a job. Test-only.
import { ATTR_BROWSER_NAVIGATION, ATTR_BROWSER_ROUTE, ATTR_BROWSER_TYPE, ATTR_PAGE, ATTR_REACT_COMMITS, ATTR_REACT_COMPONENTS, type ReactComponentStat } from "../attributes.js";
import { LOOSE_TRACE_PREFIX } from "../loose.js";
import type { Attributes, Trace } from "../types.js";
import { draft, type Draft, exception, fetchSpan, finish, log, query, span } from "./scenario-kit.js";

type PageTimings = Partial<Record<keyof typeof ATTR_PAGE, number>>;

function pageView(d: Draft, at: number, route: string, navigation: "load" | "spa", page: PageTimings): void {
  const attributes: Attributes = { [ATTR_BROWSER_TYPE]: "pageview", [ATTR_BROWSER_ROUTE]: route, [ATTR_BROWSER_NAVIGATION]: navigation, "url.full": `http://shop.test${route}` };
  for (const [k, v] of Object.entries(page)) attributes[ATTR_PAGE[k as keyof typeof ATTR_PAGE]] = v;
  span(d, { category: "browser", service: "browser", startMs: at, durationMs: page.renderMs ?? 100, name: `pageview ${route}`, attributes });
}

function reactReport(d: Draft, at: number, route: string, components: ReactComponentStat[]): void {
  const attributes: Attributes = { [ATTR_BROWSER_TYPE]: "react", [ATTR_BROWSER_ROUTE]: route, [ATTR_REACT_COMMITS]: 4, [ATTR_REACT_COMPONENTS]: JSON.stringify(components) };
  span(d, { category: "browser", service: "browser", startMs: at, durationMs: 0, name: `react renders ${route}`, attributes });
}

const stat = (name: string, renders: number, actualMs: number, selfMs: number, wasted = 0, context = 0): ReactComponentStat => ({ name, renders, actualMs, selfMs, wasted, context });

/** A slow checkout page load with every timing, large images, and React components with issues. */
export function pageCheckout(id: string, at: number, i: number): Trace {
  const d = draft(id);
  const page: PageTimings = {
    ttfbMs: 300, ssrMs: 250, clientRenderMs: 400 + i, fcpMs: 900, lcpMs: 5000 + i * 10, cls: 0.3, inpMs: 120,
    loadMs: 3200, hydrationMs: 180 + i, renderMs: 1500 + i * 20, imageMs: 700, images: 12, largeImages: 2 + (i % 3),
  };
  pageView(d, at, "/checkout", "load", page);
  reactReport(d, at + 50, "/checkout", [stat("ProductGrid", 60, 200, 120 + i, 30, 40), stat("PriceTag", 3, 100, 90), stat("ErrorBoundary", 3, 900, 0.1)]);
  log(d, at + 60, "info", "Checkout rendered", "browser");
  return finish(d);
}

/** A fast home view (client-side), or a product page whose server render is a big part of its time. */
export function pageHome(id: string, at: number, i: number): Trace {
  const d = draft(id);
  if (i % 2 === 0) {
    pageView(d, at, "/", "spa", { ttfbMs: 80, renderMs: 120 + i, fcpMs: 400, lcpMs: 900, cls: 0.01, clientRenderMs: 60 });
    return finish(d);
  }
  pageView(d, at, "/products/{}", "load", { ttfbMs: 200, ssrMs: 400 + i, renderMs: 800, hydrationMs: 150, fcpMs: 600, lcpMs: 2600, cls: 0.12, largeImages: 0, imageMs: 90 });
  reactReport(d, at + 30, "/products/{}", [stat("ProductCard", 12, 10, 4, 6), stat("ProductGrid", 2, 20, 8)]);
  return finish(d);
}

/** A browser fetch no server answered (404), and a browser error on the same page. */
export function fetchOnly(id: string, at: number, i: number): Trace {
  const d = draft(id);
  fetchSpan(d, { at, ms: 35 + i, url: "http://shop.test/api/missing?id=5", status: 404, renderMs: 5, route: "/checkout" });
  const events = exception("TypeError", `cart.items is undefined (line ${10 + (i % 3)})`, at + 40);
  span(d, { category: "browser", service: "browser", startMs: at + 40, durationMs: 0, name: "error", status: "error", events, attributes: { [ATTR_BROWSER_TYPE]: "error", [ATTR_BROWSER_ROUTE]: "/checkout" } });
  log(d, at + 41, "warn", "Missing endpoint", "browser");
  return finish(d);
}

/** Lines outside a request (startup, a timer): a loose trace with no spans, whose messages vary only in numbers and ids. */
export function outside(id: string, at: number, i: number): Trace {
  const d = draft(LOOSE_TRACE_PREFIX + id.slice(0, 16));
  log(d, at, "info", `Cache warmed in ${100 + i} ms`, "orders");
  log(d, at + 5, "debug", "Timer tick", "orders");
  log(d, at + 10, i % 2 ? "warn" : "info", `Retrying job ${4000 + i} for tenant 'acme-${i}'`, "worker-svc", null, { attempt: 1 + (i % 3) });
  if (i % 3 === 0) log(d, at + 20, "error", `Lost connection to 10.0.0.${i} after ${i} retries`, "worker-svc");
  return finish(d);
}

/** A background job: no request, one large query, and low-level logs. */
export function job(id: string, at: number, i: number): Trace {
  const d = draft(id);
  const root = span(d, { category: "internal", service: "worker-svc", startMs: at, durationMs: 1200 + i, name: "nightly-sync" });
  query(d, root, at + 10, 300 + i * 3, "SELECT * FROM users WHERE updated_at > @p0", { system: "postgresql", ns: "crm", params: "2026-01-01", rows: 120 + i, table: "users" });
  log(d, at + 1, "trace", "Job tick", "worker-svc", root.spanId);
  log(d, at + 2, "debug", "Reading changes", "worker-svc", root.spanId);
  log(d, at + 900, "info", `Synced ${120 + i} users`, "worker-svc", root.spanId);
  return finish(d);
}
