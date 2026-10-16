import type { IncomingMessage, ServerResponse } from "node:http";
import { TAG_PREFIX } from "@wizeworks/lens-core";
import { requestSpan } from "./capture.js";
import type { LogWriter } from "./logger.js";
import { activeSpan, currentServerSpan, recordOn } from "./spans.js";
import type { Next } from "./types.js";

/** Tag the running request. A tag without a value is stored as `true`. */
export function tag(key: string, value?: string): void {
  const k = key.trim();
  if (k) currentServerSpan()?.setAttribute(`${TAG_PREFIX}${k}`, value ?? true);
}

/** Set `enduser.id` on the running request. */
export function setUser(id: string): void {
  if (id) currentServerSpan()?.setAttribute("enduser.id", id);
}

/** Record an exception on the innermost active span. */
export function recordException(err: unknown): void {
  const span = activeSpan();
  if (span) recordOn(span, err);
}

/** Express error middleware: records the error on the request span and as an error log. */
export function createErrorMiddleware(write: LogWriter, service: string) {
  return function errorMiddleware(err: unknown, req: IncomingMessage, _res: ServerResponse, next: Next): void {
    const span = requestSpan(req) ?? activeSpan();
    if (span) recordOn(span, err);
    write("error", service, err instanceof Error ? err.message : String(err));
    next(err);
  };
}
