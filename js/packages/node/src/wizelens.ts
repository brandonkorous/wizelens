import { join } from "node:path";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { DEFAULT_BASE_PATH, DEFAULT_REDACT_KEYS } from "@wizeworks/lens-core";
import { createHandler } from "./api.js";
import { createMiddleware } from "./capture.js";
import { addCleanup, registerParts, runCleanups } from "./adapters/registry.js";
import { createDbSpans, createTraceDb } from "./db.js";
import { disabledWizeLens } from "./disabled.js";
import { createGetTrace } from "./federation.js";
import { connectHub } from "./hub-connect.js";
import { buildInfo, DEFAULT_N_PLUS_ONE, DEFAULT_SLOW_QUERY_MS, VERSION } from "./info.js";
import { createLogSink, createLogWriter, makeLogger } from "./logger.js";
import { captureConsole } from "./logs/console.js";
import type { McpDataSource } from "./mcp.js";
import { createMetricParts, mcpMetrics } from "./metrics/setup.js";
import type { MetricStore } from "./metrics/store.js";
import { SqlitePersister } from "./persist.js";
import { createErrorMiddleware, recordException, setUser, tag } from "./request-api.js";
import { TraceStore } from "./store.js";
import { createTracing, installGlobals } from "./tracing.js";
import type { WizeLens, WizeLensOptions } from "./types.js";
import { resolveUiDir } from "./ui.js";

export type { DbCallInfo, LogFn, WizeLens, WizeLensLogger, WizeLensOptions } from "./types.js";

function normalizeBasePath(basePath: string | undefined): string {
  return ("/" + (basePath ?? DEFAULT_BASE_PATH).replace(/^\/+|\/+$/g, "")).replace(/^\/$/, DEFAULT_BASE_PATH);
}

function openPersister(store: TraceStore, options: WizeLensOptions): SqlitePersister | undefined {
  if ((options.storage ?? "sqlite") !== "sqlite") return undefined;
  const persister = new SqlitePersister(store, {
    path: options.storagePath ?? join(process.cwd(), ".wizelens", "traces.db"),
    serviceName: options.serviceName,
  });
  if (!persister.open()) return undefined;
  persister.start();
  return persister;
}

function mcpSource(options: WizeLensOptions, store: TraceStore, getTrace: McpDataSource["get"], metrics: MetricStore | null): McpDataSource {
  return {
    service: options.serviceName,
    version: VERSION,
    slowQueryMs: options.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS,
    nPlusOneThreshold: options.nPlusOneThreshold ?? DEFAULT_N_PLUS_ONE,
    list: (limit) => store.list(limit),
    all: () => store.all(),
    get: getTrace,
    audit: options.audit ?? ((line: string) => console.info(line)),
    ...mcpMetrics(metrics),
  };
}

function buildParts(options: WizeLensOptions, basePath: string) {
  installGlobals();
  const service = options.serviceName;
  const redactKeys = options.redactKeys ?? DEFAULT_REDACT_KEYS;
  const store = new TraceStore({ maxTraces: options.maxTraces ?? 2000, maxAgeMs: options.maxAgeMs });
  const persister = openPersister(store, options);
  const selfEndpoints = new Set<string>(options.publicEndpoint ? [options.publicEndpoint] : []);
  const fetch = options.instrumentFetch ?? true;
  const tracing = createTracing(store, { service, version: VERSION, redactKeys, fetch }, selfEndpoints);
  const logs = createLogSink(store, service, redactKeys);
  const write = createLogWriter(logs, !!options.logToConsole);
  const getTrace = createGetTrace(store, selfEndpoints);
  const startedMs = Date.now();
  const sqlite = () => !!persister?.active;
  const metrics = createMetricParts(options, redactKeys);
  const info = () => buildInfo({ options, store, redactKeys, startedMs, sqlite, metrics: !!metrics });
  const mcp = mcpSource(options, store, getTrace, metrics?.store ?? null);
  const uiDir = resolveUiDir(options.uiDir);
  const hub = connectHub(options, store, info, selfEndpoints, metrics?.store ?? null);
  const handler = createHandler({ basePath, store, redactKeys, uiDir, enableMcp: !!options.enableMcp, mcp, info, getTrace, metrics: metrics?.store ?? null, selfEndpoints });
  const capture = {
    tracer: tracing.tracer,
    basePath,
    publicEndpoint: options.publicEndpoint,
    selfEndpoints,
    w3c: new W3CTraceContextPropagator(),
    captureResponseBody: !!options.captureResponseBody,
    handler,
  };
  return { hub, service, redactKeys, store, persister, tracing, logs, write, getTrace, handler, capture, metrics, middleware: createMiddleware(capture) };
}

/** Create the WizeLens add-on for one Node service. */
export function createWizeLens(options: WizeLensOptions): WizeLens {
  const basePath = normalizeBasePath(options.basePath);
  if (!(options.enabled ?? process.env.NODE_ENV !== "production")) return disabledWizeLens(options, basePath);
  const p = buildParts(options, basePath);
  const startDbSpan = createDbSpans(p.tracing.tracer, p.redactKeys, !!options.traceQueriesOutsideRequests);
  const wizelens: WizeLens = {
    enabled: true,
    serviceName: p.service,
    basePath,
    store: p.store,
    get storagePath() {
      return p.persister?.active ? p.persister.path : null;
    },
    tracer: p.tracing.tracer,
    middleware: p.middleware,
    errorMiddleware: createErrorMiddleware(p.write, p.service),
    handler: p.handler,
    traceDb: createTraceDb(startDbSpan),
    logger: makeLogger(p.write, p.service),
    recordException,
    tag,
    setUser,
    getTrace: p.getTrace,
    shutdown: async () => {
      runCleanups(wizelens);
      await p.hub?.stop();
      p.tracing.undici?.disable();
      await p.tracing.provider.shutdown();
      p.persister?.close();
    },
  };
  registerParts(wizelens, { dbSpans: startDbSpan, capture: p.capture, logs: p.logs, metrics: p.metrics?.store ?? null, provider: p.tracing.provider });
  if (p.metrics) {
    p.metrics.collector.start();
    addCleanup(wizelens, () => p.metrics!.collector.stop());
  }
  if (options.captureConsole ?? true) addCleanup(wizelens, captureConsole(p.logs));
  return wizelens;
}
