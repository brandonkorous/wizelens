// Errors frameworks throw on purpose (not found, redirects, a 4xx answer): control flow, not exceptions.
import type { Span } from "./types.js";

const NEXT_EXACT = new Set(["NoFallbackError", "Internal: NoFallbackError", "NEXT_NOT_FOUND", "BAILOUT_TO_CLIENT_SIDE_RENDERING", "DYNAMIC_SERVER_USAGE"]);
const NEXT_PREFIX = ["NEXT_HTTP_ERROR_FALLBACK;", "NEXT_REDIRECT", "NEXT_NOT_FOUND"];

/** The text a name is matched on: without an "Error: " head, as a stack's first line has it. */
const bare = (n: string): string => n.replace(/^(?:Error|Internal):\s*/, "").trim();

/** A Next.js control-flow error, by its type, message, or digest (`NEXT_HTTP_ERROR_FALLBACK;404`, `NEXT_REDIRECT;…`, `NEXT_NOT_FOUND`). */
export const isNextControlFlow = (...names: (string | null | undefined)[]): boolean =>
  names.some((n) => !!n && (NEXT_EXACT.has(n) || NEXT_EXACT.has(bare(n)) || NEXT_PREFIX.some((p) => bare(n).startsWith(p))));

const isClientStatus = (code: unknown): boolean => Number(code) >= 400 && Number(code) < 500;

/** A Better Auth `APIError` that answered 4xx: the caller's mistake, not the app's. */
export const isClientApiError = (type: unknown, status: unknown): boolean => type === "APIError" && isClientStatus(status);

const text = (v: unknown): string => (v == null ? "" : String(v));

/** An exception event on a span that is control flow. */
function isControlFlowEvent(e: Span["events"][number], spanStatus: unknown): boolean {
  if (e.name !== "exception") return false;
  const a = e.attributes;
  return isNextControlFlow(text(a["exception.type"]), text(a["exception.message"]), text(a["exception.digest"])) || isClientApiError(a["exception.type"], spanStatus);
}

/** The span without control-flow exception events; an error status they caused is cleared, so the span counts by its HTTP status. */
export function dropControlFlow(span: Span): Span {
  const code = span.attributes["http.response.status_code"];
  const events = span.events.filter((e) => !isControlFlowEvent(e, code));
  const flowStatus = span.status === "error" && !!span.statusMessage && isNextControlFlow(span.statusMessage);
  if (events.length === span.events.length && !flowStatus) return span;
  // A status message that only repeats a dropped event's message (or type) was caused by it.
  const dropped = span.events.filter((e) => !events.includes(e)).flatMap((e) => [text(e.attributes["exception.message"]), text(e.attributes["exception.type"])]);
  const msg = span.statusMessage;
  const onlyFlow = !events.some((e) => e.name === "exception") && (!msg || isNextControlFlow(msg) || dropped.includes(msg));
  const status = span.status === "error" && onlyFlow ? "unset" : span.status;
  return { ...span, events, status, statusMessage: status === "unset" ? null : msg };
}
