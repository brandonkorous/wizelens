// Builders for page view and React render traces. Test-only: excluded from the build.
import { ATTR_BROWSER_NAVIGATION, ATTR_BROWSER_ROUTE, ATTR_BROWSER_TYPE, ATTR_PAGE, ATTR_REACT_COMMITS, ATTR_REACT_COMPONENTS, type ReactComponentStat } from "../attributes.js";
import { newTraceId } from "../ids.js";
import { buildTrace } from "../trace.js";
import type { Attributes, Trace } from "../types.js";
import { makeSpan } from "./fixtures.js";

export interface PageViewFixture {
  startMs?: number;
  route?: string;
  navigation?: "load" | "spa";
  page?: Partial<Record<keyof typeof ATTR_PAGE, number>>;
  components?: ReactComponentStat[] | string;
  userAgent?: string;
}

/** One page view trace, with an optional React render report. */
export function makePageView(f: PageViewFixture = {}): Trace {
  const traceId = newTraceId();
  const startMs = f.startMs ?? 1_700_000_000_000;
  const route = f.route ?? "/";
  const attributes: Attributes = { [ATTR_BROWSER_TYPE]: "pageview", [ATTR_BROWSER_ROUTE]: route, [ATTR_BROWSER_NAVIGATION]: f.navigation ?? "load", "url.full": `http://app.test${route}` };
  if (f.userAgent) attributes["user_agent.original"] = f.userAgent;
  for (const [k, v] of Object.entries(f.page ?? {})) attributes[ATTR_PAGE[k as keyof typeof ATTR_PAGE]] = v;
  const spans = [makeSpan({ traceId, category: "browser", service: "browser", startMs, durationMs: f.page?.renderMs ?? 100, name: `pageview ${route}`, attributes })];
  if (f.components !== undefined) {
    const json = typeof f.components === "string" ? f.components : JSON.stringify(f.components);
    const react: Attributes = { [ATTR_BROWSER_TYPE]: "react", [ATTR_BROWSER_ROUTE]: route, [ATTR_REACT_COMMITS]: 3, [ATTR_REACT_COMPONENTS]: json };
    spans.push(makeSpan({ traceId, category: "browser", service: "browser", startMs: startMs + 50, durationMs: 0, name: `react renders ${route}`, attributes: react }));
  }
  return buildTrace(traceId, spans, [], []);
}

export const component = (name: string, over: Partial<ReactComponentStat> = {}): ReactComponentStat => ({
  name,
  renders: 1,
  actualMs: 1,
  selfMs: 1,
  wasted: 0,
  context: 0,
  ...over,
});
