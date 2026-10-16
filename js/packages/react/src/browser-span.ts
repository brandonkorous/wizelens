import {
  type Attributes,
  ATTR_BROWSER_ROUTE,
  ATTR_BROWSER_SESSION,
  ATTR_BROWSER_TYPE,
  type BrowserSpanType,
  pathShape,
  type Span,
  type SpanEvent,
} from "@wizeworks/lens-core";

/** The page view a browser span belongs to. */
export interface ViewRef {
  traceId: string;
  spanId: string;
  route: string;
  url: string;
}

export interface BrowserSpanInput {
  type: BrowserSpanType;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  startMs: number;
  durationMs: number;
  sessionId: string;
  route: string | null;
  attributes?: Attributes;
  error?: string | null;
  events?: SpanEvent[];
}

/** Route shape of the current page, for example "/products/{}". */
export function currentRoute(): string {
  return typeof location !== "undefined" ? pathShape(location.pathname) : "/";
}

/** A contract span from the browser, with the attributes every browser span carries. */
export function browserSpan(i: BrowserSpanInput): Span {
  return {
    traceId: i.traceId,
    spanId: i.spanId,
    parentSpanId: i.parentSpanId,
    name: i.name.slice(0, 500),
    kind: i.type === "fetch" ? "client" : "internal",
    category: "browser",
    service: "browser",
    startMs: i.startMs,
    durationMs: Math.max(0, i.durationMs),
    status: i.error ? "error" : "unset",
    statusMessage: i.error ?? null,
    attributes: {
      ...i.attributes,
      [ATTR_BROWSER_TYPE]: i.type,
      [ATTR_BROWSER_SESSION]: i.sessionId,
      [ATTR_BROWSER_ROUTE]: i.route,
    },
    events: i.events ?? [],
  };
}

/** Round to 0.1 so spans stay small. Null stays null. */
export const round1 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
