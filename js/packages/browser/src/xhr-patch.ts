import { formatTraceparent } from "@wizeworks/lens-core/internal";
import { failureOf, isPrefetch } from "./fetch-failure.js";
import { type Answer, type FetchContext, finishCall, isWizeLensCall, startCall } from "./request-span.js";
import { now } from "./session.js";

const INFO = Symbol.for("wizelens.xhr");
const HEADERS_RECEIVED = 2;

type Tracked = XMLHttpRequest & { [INFO]?: { method: string; url: string } };
type Open = (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) => void;

function answerOf(xhr: XMLHttpRequest): Answer {
  return {
    status: xhr.status,
    header(name) {
      try {
        return xhr.getResponseHeader(name);
      } catch {
        return null;
      }
    },
    // The app's load handlers ran before loadend: the body is read.
    whenRead: (onRead) => onRead(),
  };
}

// Add traceparent, then send a browser span when the request ends.
function track(ctx: FetchContext, xhr: Tracked): void {
  const info = xhr[INFO];
  if (!info) return;
  let url: URL;
  try {
    url = new URL(info.url, ctx.base);
  } catch {
    return;
  }
  if (isWizeLensCall(url, ctx.endpoint)) return;
  const call = startCall(ctx, "xhr", url, info.method.toUpperCase(), isPrefetch(url, null));
  if (ctx.propagateTo(url)) {
    try {
      xhr.setRequestHeader("traceparent", formatTraceparent(call.traceId, call.spanId, true));
    } catch {
      // Not opened: the request fails on its own.
    }
  }
  let headersAt: number | undefined;
  let reason = new Error("Network error");
  let aborted = false;
  const onState = () => xhr.readyState === HEADERS_RECEIVED && (headersAt ??= now());
  xhr.addEventListener("readystatechange", onState);
  xhr.addEventListener("abort", () => {
    aborted = true;
    reason = Object.assign(new Error("Aborted"), { name: "AbortError" });
  });
  xhr.addEventListener("timeout", () => (reason = Object.assign(new Error("Timed out"), { name: "TimeoutError" })));
  xhr.addEventListener("loadend", () => {
    xhr.removeEventListener("readystatechange", onState);
    const ok = xhr.status !== 0;
    finishCall(ctx, call, ok ? answerOf(xhr) : null, ok ? null : failureOf(reason, null, aborted), headersAt);
  });
}

/** Trace `XMLHttpRequest` calls like fetch calls (Angular's HttpClient and axios use it). Returns an undo function. */
export function patchXhr(ctx: FetchContext): () => void {
  if (typeof XMLHttpRequest === "undefined") return () => {};
  const proto = XMLHttpRequest.prototype as Tracked;
  const open = proto.open as Open;
  const send = proto.send;
  const patchedOpen: Open = function (this: Tracked, method, url, ...rest) {
    this[INFO] = { method, url: String(url) };
    return open.call(this, method, url, ...rest);
  };
  const patchedSend = function (this: Tracked, body?: Document | XMLHttpRequestBodyInit | null) {
    track(ctx, this);
    return send.call(this, body);
  };
  proto.open = patchedOpen as XMLHttpRequest["open"];
  proto.send = patchedSend;
  return () => {
    // Leave a method alone when something else wrapped it after us.
    if (proto.open === (patchedOpen as unknown)) proto.open = open as XMLHttpRequest["open"];
    if (proto.send === patchedSend) proto.send = send;
  };
}
