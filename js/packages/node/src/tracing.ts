import { context, propagation, type Tracer } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { AlwaysOnSampler, BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { HEADER_ENDPOINT, HEADER_HOP } from "@wizeworks/lens-core";
import { type OnRemote, remoteNoter } from "./client-attributes.js";
import { instrumentHttp } from "./http-client.js";
import { hasRequestHeader, responseHeader } from "./http-util.js";
import { preciseProvider, preciseTracer } from "./precise.js";
import { StoreSpanProcessor } from "./processor.js";
import type { TraceStore } from "./store.js";

export interface Tracing {
  provider: BasicTracerProvider;
  tracer: Tracer;
  undici: UndiciInstrumentation | undefined;
  /** Stops the node:http client tracing, when it is on. */
  stopHttp: (() => void) | undefined;
}

let globalsInstalled = false;

/** Install one ALS context manager and the W3C propagator. Apps that set their own keep them. */
export function installGlobals(): void {
  if (globalsInstalled) return;
  globalsInstalled = true;
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
}

function instrumentFetch(provider: BasicTracerProvider, onRemote: OnRemote): UndiciInstrumentation {
  const undici = new UndiciInstrumentation({
    requireParentforSpans: true,
    // Federation calls carry X-WizeLens-Hop. Do not trace WizeLens talking to itself.
    ignoreRequestHook: (request) => hasRequestHeader(request.headers, HEADER_HOP),
    responseHook: (span, { response }) => {
      const endpoint = responseHeader(response.headers, HEADER_ENDPOINT);
      if (endpoint) onRemote(span.spanContext().traceId, endpoint);
    },
  });
  undici.setTracerProvider(preciseProvider(provider));
  return undici;
}

export interface TracingOptions {
  service: string;
  version: string;
  /** The app's version (`service.version`). */
  release?: string;
  redactKeys: readonly string[];
  fetch: boolean;
  /** Trace node:http and node:https client calls (axios, got, and the rest). */
  http: boolean;
}

/** One tracer provider per WizeLens instance. Every finished span goes into the store. */
export function createTracing(store: TraceStore, o: TracingOptions, selfEndpoints: ReadonlySet<string>): Tracing {
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({ "service.name": o.service, ...(o.release ? { "service.version": o.release } : {}) }),
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new StoreSpanProcessor(store, o.service, o.redactKeys, o.release)],
  });
  const tracer = preciseTracer(provider.getTracer("@wizeworks/lens-node", o.version));
  const onRemote = remoteNoter(store, selfEndpoints);
  const undici = o.fetch ? instrumentFetch(provider, onRemote) : undefined;
  const stopHttp = o.http ? instrumentHttp(tracer, onRemote) : undefined;
  return { provider, tracer, undici, stopHttp };
}
