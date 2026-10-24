// Errors frameworks throw on purpose (not found, redirects, a 4xx answer): control flow, not exceptions.
import type { Span } from "@wizeworks/lens-core";

const NEXT_EXACT = new Set(["NoFallbackError", "Internal: NoFallbackError", "NEXT_NOT_FOUND", "BAILOUT_TO_CLIENT_SIDE_RENDERING", "DYNAMIC_SERVER_USAGE"]);
const NEXT_PREFIX = ["NEXT_HTTP_ERROR_FALLBACK;", "NEXT_REDIRECT"];

/** A Next.js control-flow error, by its type, message, or digest. */
export const isNextControlFlow = (...names: (string | null | undefined)[]): boolean =>
  names.some((n) => !!n && (NEXT_EXACT.has(n) || NEXT_PREFIX.some((p) => n.startsWith(p))));

const isClientStatus = (code: unknown): boolean => Number(code) >= 400 && Number(code) < 500;

/** A Better Auth `APIError` that answered 4xx: the caller's mistake, not the app's. */
export const isClientApiError = (type: unknown, status: unknown): boolean => type === "APIError" && isClientStatus(status);

/** A thrown value that is control flow: a Next.js signal, or a Better Auth 4xx. */
export function isControlFlowError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; message?: unknown; digest?: unknown; statusCode?: unknown };
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return isNextControlFlow(str(e.name), str(e.message), str(e.digest)) || isClientApiError(e.name, e.statusCode);
}

/** An exception event on a span that is control flow. */
function isControlFlowEvent(e: Span["events"][number], spanStatus: unknown): boolean {
  if (e.name !== "exception") return false;
  const type = e.attributes["exception.type"];
  const message = e.attributes["exception.message"];
  return isNextControlFlow(String(type ?? ""), String(message ?? "")) || isClientApiError(type, spanStatus);
}

/** The span without control-flow exception events; an error status they caused is cleared too. */
export function dropControlFlow(span: Span): Span {
  const code = span.attributes["http.response.status_code"];
  const events = span.events.filter((e) => !isControlFlowEvent(e, code));
  if (events.length === span.events.length) return span;
  const onlyFlow = !events.some((e) => e.name === "exception") && (!span.statusMessage || isNextControlFlow(span.statusMessage));
  const status = span.status === "error" && onlyFlow ? "unset" : span.status;
  return { ...span, events, status, statusMessage: status === "unset" ? null : span.statusMessage };
}
