import { trace } from "@opentelemetry/api";
import { hubUrlOf } from "./hub-connect.js";
import { noopLogger } from "./logger.js";
import { TraceStore } from "./store.js";
import type { WizeLens, WizeLensOptions } from "./types.js";

/** The instance used when WizeLens is off: every call passes through or does nothing. `quiet` for a stand-in that is not the app's choice. */
export function disabledWizeLens(options: WizeLensOptions, basePath: string, quiet = false): WizeLens {
  // Off only by the production default while a hub is set: say so, or the service sends nothing without a word.
  const hub = hubUrlOf(options);
  if (!quiet && hub && options.enabled === undefined && process.env.WIZELENS_ENABLED === undefined) {
    console.warn(`[wizelens] Off in production, so nothing is sent to ${hub}. Set WIZELENS_ENABLED=true to send.`);
  }
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
