import { type Context, context, type Span, type SpanOptions, type TimeInput, type Tracer, type TracerProvider } from "@opentelemetry/api";

/** Epoch ms with sub-ms precision. OTel anchors each span on Date.now(), which is whole ms only. */
export const preciseNow = (): number => performance.timeOrigin + performance.now();

function preciseSpan(span: Span): Span {
  const end = span.end.bind(span);
  span.end = (time?: TimeInput) => end(time ?? preciseNow());
  return span;
}

/** startActiveSpan with an exact start and end. Next.js starts all its spans this way. */
function preciseActive(tracer: Tracer): Tracer["startActiveSpan"] {
  const start = tracer.startActiveSpan.bind(tracer) as (n: string, o: SpanOptions, c: Context, f: (s: Span) => unknown) => unknown;
  return ((name: string, ...rest: unknown[]) => {
    const fn = rest.pop() as (span: Span) => unknown;
    const [options = {}, ctx = context.active()] = rest as [SpanOptions | undefined, Context | undefined];
    const timed = { ...options, startTime: options.startTime ?? preciseNow() };
    return start(name, timed, ctx, (span) => fn(preciseSpan(span)));
  }) as Tracer["startActiveSpan"];
}

/** A tracer that gives every span an exact start and end, so sub-ms queries keep their order. */
export function preciseTracer(tracer: Tracer): Tracer {
  const startSpan = (name: string, options: SpanOptions = {}, ctx?: Context): Span =>
    preciseSpan(tracer.startSpan(name, { ...options, startTime: options.startTime ?? preciseNow() }, ctx));
  return { startSpan, startActiveSpan: preciseActive(tracer) };
}

/** The same, for instrumentations that ask a provider for their tracer. */
export function preciseProvider(provider: TracerProvider): TracerProvider {
  return { getTracer: (name, version, options) => preciseTracer(provider.getTracer(name, version, options)) };
}
