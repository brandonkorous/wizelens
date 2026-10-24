import { newSpanId, type Span } from "@wizeworks/lens-core";
import { browserSpan, type ViewRef } from "./browser-span.js";
import { now } from "./session.js";

export interface CapturedError {
  type: string;
  message: string;
  stack: string | null;
}

// Stop after this many errors per page, so a render loop cannot flood the server.
const MAX_ERRORS = 100;

/** Normalize anything thrown into a type, a message, and a stack. */
export function toCapturedError(value: unknown, fallback = "Unknown error"): CapturedError {
  if (value instanceof Error) {
    return { type: value.name || "Error", message: value.message || fallback, stack: value.stack ?? null };
  }
  if (typeof value === "string") return { type: "Error", message: value, stack: null };
  try {
    return { type: "Error", message: value === undefined ? fallback : JSON.stringify(value), stack: null };
  } catch {
    return { type: "Error", message: fallback, stack: null };
  }
}

/** A browser error span in the page view's trace. */
export function errorSpan(view: ViewRef, err: CapturedError, sessionId: string): Span {
  const at = now();
  return browserSpan({
    type: "error",
    traceId: view.traceId,
    spanId: newSpanId(),
    parentSpanId: view.spanId,
    name: `${err.type}: ${err.message}`,
    startMs: at,
    durationMs: 0,
    sessionId,
    route: view.route,
    error: err.message,
    attributes: { "url.full": typeof location !== "undefined" ? location.href : view.url },
    events: [
      {
        name: "exception",
        timeMs: at,
        attributes: { "exception.type": err.type, "exception.message": err.message, "exception.stacktrace": err.stack },
      },
    ],
  });
}

/** A page the browser renders ahead, before anyone opens it: its errors are not anyone's. */
const isPrerendering = (): boolean => typeof document !== "undefined" && (document as { prerendering?: boolean }).prerendering === true;

/** Report uncaught errors and unhandled promise rejections. Returns a stop function. */
export function watchErrors(onError: (err: CapturedError) => void): () => void {
  if (typeof addEventListener !== "function") return () => {};
  let count = 0;
  const report = (err: CapturedError) => {
    if (!isPrerendering() && ++count <= MAX_ERRORS) onError(err);
  };
  const onWindowError = (e: Event) => {
    const ev = e as ErrorEvent;
    report(toCapturedError(ev.error ?? ev.message, "Script error"));
  };
  const onRejection = (e: Event) => report(toCapturedError((e as PromiseRejectionEvent).reason, "Unhandled rejection"));
  addEventListener("error", onWindowError);
  addEventListener("unhandledrejection", onRejection);
  return () => {
    removeEventListener("error", onWindowError);
    removeEventListener("unhandledrejection", onRejection);
  };
}
