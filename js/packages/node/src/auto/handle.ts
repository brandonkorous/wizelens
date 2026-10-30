import { context, ProxyTracerProvider, trace, type Tracer, type TracerProvider } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { DEFAULT_BASE_PATH } from "@wizeworks/lens-core/internal";
import { type AdapterParts, registerParts } from "../adapters/registry.js";
import type { StartDbSpan } from "../db.js";
import { disabledWizeLens } from "../disabled.js";
import type { LogSink } from "../logger.js";
import type { CaptureDeps } from "../request-capture.js";
import type { WizeLens } from "../types.js";
import { currentOwner } from "./owner.js";

// Adapters keep the instance they patch with, so they get this handle: it points at whoever owns the data now.

const NOOP_TRACER = new ProxyTracerProvider().getTracer("@wizeworks/lens-node");

const tracerNow = (): Tracer => currentOwner()?.parts.capture.tracer ?? NOOP_TRACER;

/** A tracer that starts each span on the owner's tracer, or a no-op one when WizeLens is off. */
export const autoTracer: Tracer = {
  startSpan: (name, options, ctx) => tracerNow().startSpan(name, options, ctx),
  startActiveSpan: ((...args: unknown[]) => (tracerNow().startActiveSpan as (...a: unknown[]) => unknown)(...args)) as Tracer["startActiveSpan"],
};

const provider: TracerProvider = { getTracer: () => autoTracer };

const fallbackCapture: CaptureDeps = {
  tracer: NOOP_TRACER,
  basePath: DEFAULT_BASE_PATH,
  publicEndpoint: undefined,
  selfEndpoints: new Set<string>(),
  w3c: new W3CTraceContextPropagator(),
  captureResponseBody: false,
  traceStaticFiles: false,
  handler: async () => false,
  hudTag: null,
};

const capture = new Proxy(fallbackCapture, {
  get: (fallback, key) => (key === "tracer" ? autoTracer : Reflect.get(currentOwner()?.parts.capture ?? fallback, key)),
});

// A query outside any request starts nothing, so a script that only runs migrations never starts WizeLens.
const dbSpans: StartDbSpan = (info, sql, params) => {
  if (info.requireParent && !trace.getSpan(context.active())) return null;
  return currentOwner()?.parts.dbSpans(info, sql, params) ?? null;
};

// Log lines go to the auto instance only. A code install hooks its loggers itself.
const logs: LogSink = (entry) => {
  const owner = currentOwner();
  if (owner?.auto) owner.parts.logs(entry);
};

const parts: AdapterParts = { dbSpans, capture, logs, metrics: null, provider };

// A stand-in until an owner starts: it never says WizeLens is off.
const disabled = disabledWizeLens({ service: "auto" }, DEFAULT_BASE_PATH, true);

/** The instance the auto hooks hand to the adapters. Every read goes to the current owner. */
export const autoHandle: WizeLens = new Proxy(disabled, {
  get: (off, key) => (key === "tracer" ? autoTracer : Reflect.get(currentOwner()?.wizelens ?? off, key)),
});

registerParts(autoHandle, parts);
