import { trace } from "@opentelemetry/api";
import { noopLogger } from "./logger.js";
import { TraceStore } from "./store.js";
import type { WizeLens, WizeLensOptions } from "./types.js";

/** The instance used when WizeLens is off: every call passes through or does nothing. */
export function disabledWizeLens(options: WizeLensOptions, basePath: string): WizeLens {
  return {
    enabled: false,
    serviceName: options.serviceName,
    basePath,
    store: new TraceStore({ maxTraces: 1 }),
    storagePath: null,
    tracer: trace.getTracer("@wizeworks/lens-node"),
    middleware: (_req, _res, next) => next(),
    errorMiddleware: (err, _req, _res, next) => next(err),
    handler: async () => false,
    traceDb: (_info, _sql, _params, fn) => fn(),
    logger: noopLogger(),
    recordException: () => {},
    tag: () => {},
    expected: () => {},
    setUser: () => {},
    getTrace: async () => undefined,
    shutdown: async () => {},
  };
}
