// A page view's own problems: main content later than Google's lines, with the pictures bigger than the screen needs.
import { ATTR_BROWSER_ROUTE, ATTR_PAGE, browserTypeOf } from "./attributes.js";
import type { Finding } from "./analysis.js";
import type { Span, Trace } from "./types.js";

/** Google's lines for a good and a poor Largest Contentful Paint. */
export const READY_GOOD_MS = 2500;
export const READY_POOR_MS = 4000;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

function slowView(s: Span): Finding[] {
  const ready = num(s.attributes[ATTR_PAGE.renderMs]) ?? (s.durationMs > 0 ? s.durationMs : null);
  if (ready === null || ready <= READY_GOOD_MS) return [];
  const large = num(s.attributes[ATTR_PAGE.largeImages]) ?? 0;
  const pictures = large > 0 ? `; ${large} ${large === 1 ? "picture is" : "pictures are"} bigger than the screen needs` : "";
  const route = s.attributes[ATTR_BROWSER_ROUTE];
  return [{
    kind: "slow-page",
    severity: ready > READY_POOR_MS ? "warning" : "info",
    title: `Slow page: the main content showed at ${(ready / 1000).toFixed(2)} s${pictures}`,
    shape: typeof route === "string" && route ? route : s.name,
    count: 1,
    totalMs: ready,
    spanIds: [s.spanId],
  }];
}

/** Page views whose main content showed after 2.5 s. */
export const findSlowPages = (trace: Pick<Trace, "spans">): Finding[] => trace.spans.filter((s) => browserTypeOf(s) === "pageview").flatMap(slowView);
