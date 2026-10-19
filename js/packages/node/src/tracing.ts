import { context, propagation, type Tracer } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { AlwaysOnSampler, BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { HEADER_ENDPOINT, HEADER_HOP } from "@wizeworks/lens-core";
import { hasRequestHeader, responseHeader } from "./http-util.js";
import { preciseProvider, preciseTracer } from "./precise.js";
import { StoreSpanProcessor } from "./processor.js";
import type { TraceStore } from "./store.js";

export interface Tracing {
  provider: BasicTracerProvider;
  tracer: Tracer;
  undici: UndiciInstrumentation | undefined;
}

let globalsInstalled = false;

/** Install one ALS context manager and the W3C propagator. Apps that set their own keep them. */
export function installGlobals(): void {
  if (globalsInstalled) return;
  globalsInstalled = true;
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
}

function instrumentFetch(provider: BasicTracerProvider, store: TraceStore, selfEndpoints: ReadonlySet<string>): UndiciInstrumentation {
  const undici = new UndiciInstrumentation({
    requireParentforSpans: true,
    // Federation calls carry X-WizeLens-Hop. Do not trace WizeLens talking to itself.
    ignoreRequestHook: (request) => hasRequestHeader(request.headers, HEADER_HOP),
    responseHook: (span, { response }) => {
      const endpoint = responseHeader(response.headers, HEADER_ENDPOINT);
      if (endpoint && !selfEndpoints.has(endpoint)) store.addRemote(span.spanContext().traceId, endpoint);
    },
  });
  undici.setTracerProvider(preciseProvider(provider));
  return undici;
}

export interface TracingOptions {
  service: string;
  version: string;
  /** The app's version, kept on every span as `service.version`. */
  serviceVersion?: string;
  redactKeys: readonly string[];
  fetch: boolean;
}

/** The app's version: the option, else OTEL_SERVICE_VERSION, else the version npm runs the app with. */
export const serviceVersionOf = (o: { serviceVersion?: string }): string | undefined =>
  o.serviceVersion || process.env.OTEL_SERVICE_VERSION || process.env.npm_package_version || undefined;

/** One tracer provider per WizeLens instance. Every finished span goes into the store. */
export function createTracing(store: TraceStore, o: TracingOptions, selfEndpoints: ReadonlySet<string>): Tracing {
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({ "service.name": o.service, ...(o.serviceVersion ? { "service.version": o.serviceVersion } : {}) }),
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new StoreSpanProcessor(store, o.service, o.redactKeys, o.serviceVersion)],
  });
  const tracer = preciseTracer(provider.getTracer("@wizeworks/lens-node", o.version));
  const undici = o.fetch ? instrumentFetch(provider, store, selfEndpoints) : undefined;
  return { provider, tracer, undici };
}
