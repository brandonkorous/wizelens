import { context, createContextKey, type Span as OtelSpan, SpanStatusCode, trace } from "@opentelemetry/api";

/** Context key that holds the server span of the current request. */
export const SERVER_SPAN = createContextKey("wizeworks.wizelens.server-span");

export function recordOn(span: OtelSpan, err: unknown): void {
  const error = err instanceof Error ? err : new Error(String(err));
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
}

/** The server span of the request that is running now, if any. */
export function currentServerSpan(): OtelSpan | undefined {
  return context.active().getValue(SERVER_SPAN) as OtelSpan | undefined;
}

/** The innermost active span, if any. */
export function activeSpan(): OtelSpan | undefined {
  return trace.getSpan(context.active());
}
