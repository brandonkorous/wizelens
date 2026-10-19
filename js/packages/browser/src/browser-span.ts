import {
  type Attributes,
  ATTR_BROWSER_ROUTE,
  ATTR_BROWSER_SESSION,
  ATTR_BROWSER_TYPE,
  type BrowserSpanType,
  pathShape,
  type Span,
  type SpanEvent,
  VERSION_ATTR,
} from "@wizeworks/lens-core";

// OTel name of the signed-in user. The add-ons put it on server spans too.
const ATTR_ENDUSER = "enduser.id";

/** The web app's version, put on every browser span as `service.version`. */
let release: string | undefined;
export const setBrowserRelease = (v: string | undefined): void => void (release = v?.trim().slice(0, 50) || undefined);

/** The signed-in user, put on every browser span as `enduser.id`. */
let user: string | undefined;
export const setBrowserUser = (id: string | null | undefined): void => void (user = id?.trim().slice(0, 200) || undefined);

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
      ...(release ? { [VERSION_ATTR]: release } : {}),
      ...(user ? { [ATTR_ENDUSER]: user } : {}),
    },
    events: i.events ?? [],
  };
}

/** Round to 0.1 so spans stay small. Null stays null. */
export const round1 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
