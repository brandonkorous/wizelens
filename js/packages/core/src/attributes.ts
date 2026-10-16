import type { Span } from "./types.js";

// Attribute names beyond the OTel basics. See docs/CONTRACT.md, "Attribute names".

/** Browser span: ties a span to one browser tab. */
export const ATTR_BROWSER_SESSION = "wizelens.browser.session";
/** Browser fetch span: ms from the response to the next paint (body download, app code, render, paint). */
export const ATTR_BROWSER_RENDER_MS = "wizelens.browser.render_ms";
/** Browser span type. Absent means "fetch". */
export const ATTR_BROWSER_TYPE = "wizelens.browser.type";
/** Route shape of the page the span belongs to, for example "/products/{}". */
export const ATTR_BROWSER_ROUTE = "wizelens.browser.route";
/** Page view: "load" for a full page load, "spa" for a client-side route change. */
export const ATTR_BROWSER_NAVIGATION = "wizelens.browser.navigation";

export type BrowserSpanType = "fetch" | "pageview" | "react" | "error";

/** Type of a browser span, or null for a server span. */
export function browserTypeOf(span: Span): BrowserSpanType | null {
  if (span.category !== "browser") return null;
  const t = span.attributes[ATTR_BROWSER_TYPE];
  return t === "pageview" || t === "react" || t === "error" ? t : "fetch";
}

/** Page view timings in ms (CLS is a score). Absent when not measured. */
export const ATTR_PAGE = {
  ttfbMs: "wizelens.page.ttfb_ms",
  ssrMs: "wizelens.page.ssr_ms",
  clientRenderMs: "wizelens.page.client_render_ms",
  fcpMs: "wizelens.page.fcp_ms",
  lcpMs: "wizelens.page.lcp_ms",
  cls: "wizelens.page.cls",
  inpMs: "wizelens.page.inp_ms",
  loadMs: "wizelens.page.load_ms",
  hydrationMs: "wizelens.page.hydration_ms",
  renderMs: "wizelens.page.render_ms",
  imageMs: "wizelens.page.image_ms",
  images: "wizelens.page.images",
  largeImages: "wizelens.page.large_images",
} as const;

/** React render stats span: JSON string of ReactComponentStat[]. */
export const ATTR_REACT_COMPONENTS = "wizelens.react.components";
/** React render stats span: commits since the last report. */
export const ATTR_REACT_COMMITS = "wizelens.react.commits";

/** Render work of one component since the last report. */
export interface ReactComponentStat {
  name: string;
  renders: number;
  /** Sum of the time spent rendering the component and its children. */
  actualMs: number;
  /** Sum of the time spent in the component itself. */
  selfMs: number;
  /** Renders with the same props, state, and context as before. */
  wasted: number;
  /** Renders caused only by a context value change. */
  context: number;
}

/** Server span: request id from the framework or the x-request-id header. */
export const ATTR_REQUEST_ID = "wizelens.request.id";
/** Server span: ms from the request start to the matched endpoint (routing and middleware). */
export const ATTR_ROUTED_MS = "wizelens.server.routed_ms";
/** Server span: first part of the response body. Only when body capture is on. */
export const ATTR_RESPONSE_BODY = "wizelens.response.body";
/** Server span: true when the body preview was cut. */
export const ATTR_RESPONSE_BODY_TRUNCATED = "wizelens.response.body.truncated";
/** Prefix for app tags: "wizelens.tag.cache" = "hit" shows as "cache:hit". */
export const TAG_PREFIX = "wizelens.tag.";
/** Prefix for captured request headers (OTel). */
export const REQUEST_HEADER_PREFIX = "http.request.header.";
/** Prefix for captured response headers (OTel). */
export const RESPONSE_HEADER_PREFIX = "http.response.header.";
/** Internal span layer: "handler" for the controller action or endpoint handler. */
export const ATTR_LAYER = "wizelens.layer";

/** gRPC (OTel rpc conventions). gRPC spans keep the http.server / http.client categories and add these. */
export const ATTR_RPC = {
  system: "rpc.system",
  service: "rpc.service",
  method: "rpc.method",
  grpcStatus: "rpc.grpc.status_code",
} as const;

/** Message queues (OTel messaging conventions). Producer spans send, consumer spans receive or process. */
export const ATTR_MESSAGING = {
  system: "messaging.system",
  operation: "messaging.operation.type",
  destination: "messaging.destination.name",
  messageId: "messaging.message.id",
  batchSize: "messaging.batch.message_count",
  bodySize: "messaging.message.body.size",
} as const;

/** `messaging.operation.type` values used by the add-ons. */
export type MessagingOperation = "send" | "receive" | "process";
