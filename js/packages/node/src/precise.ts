import type { Context, Span, SpanOptions, TimeInput, Tracer, TracerProvider } from "@opentelemetry/api";

/** Epoch ms with sub-ms precision. OTel anchors each span on Date.now(), which is whole ms only. */
export const preciseNow = (): number => performance.timeOrigin + performance.now();

function preciseSpan(span: Span): Span {
  const end = span.end.bind(span);
  span.end = (time?: TimeInput) => end(time ?? preciseNow());
  return span;
}

/** A tracer that gives every span an exact start and end, so sub-ms queries keep their order. */
export function preciseTracer(tracer: Tracer): Tracer {
  const startSpan = (name: string, options: SpanOptions = {}, ctx?: Context): Span =>
    preciseSpan(tracer.startSpan(name, { ...options, startTime: options.startTime ?? preciseNow() }, ctx));
  return {
    startSpan,
    startActiveSpan: tracer.startActiveSpan.bind(tracer) as Tracer["startActiveSpan"],
  };
}

/** The same, for instrumentations that ask a provider for their tracer. */
export function preciseProvider(provider: TracerProvider): TracerProvider {
  return { getTracer: (name, version, options) => preciseTracer(provider.getTracer(name, version, options)) };
}
