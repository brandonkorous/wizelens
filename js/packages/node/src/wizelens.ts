import { join } from "node:path";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { DEFAULT_BASE_PATH, DEFAULT_REDACT_KEYS, envSwitch, type SendState, type TagRule, tagsFromOptions } from "@wizeworks/lens-core";
import { createHandler } from "./api.js";
import { createMiddleware } from "./capture.js";
import { addCleanup, partsOf, registerParts, runCleanups } from "./adapters/registry.js";
import { noteCodeInstall } from "./auto/state.js";
import { createDbSpans, createTraceDb } from "./db.js";
import { disabledWizeLens } from "./disabled.js";
import { createGetTrace } from "./federation.js";
import { connectHub, releaseOf } from "./hub-connect.js";
import { hudTagFor, resolveHudBundle } from "./hud-bundle.js";
import { samplingInfo, TraceSampler } from "./sampling.js";
import { buildInfo, DEFAULT_N_PLUS_ONE, DEFAULT_SLOW_QUERY_MS, VERSION } from "./info.js";
import { createLogSink, createLogWriter, makeLogger } from "./logger.js";
import { looseLogsOf } from "./loose-logs.js";
import { captureConsole } from "./logs/console.js";
import type { McpDataSource } from "./mcp.js";
import { memoryPages } from "./mcp-memory.js";
import { createMetricParts, mcpMetrics } from "./metrics/setup.js";
import type { MetricStore } from "./metrics/store.js";
import { SqlitePersister } from "./persist.js";
import { createErrorMiddleware, expected, recordException, setUser, tag } from "./request-api.js";
import { TraceStore } from "./store.js";
import { trustedOrigins } from "./client-spans.js";
import { hudOn, isEnabled, servesDashboard } from "./mode.js";
import { localMapLoader } from "./sourcemaps.js";
import { createTracing, installGlobals } from "./tracing.js";
import type { WizeLens, WizeLensOptions } from "./types.js";
import { resolveUiDir } from "./ui.js";

export type { DbCallInfo, LogFn, WizeLens, WizeLensLogger, WizeLensOptions } from "./types.js";

function normalizeBasePath(basePath: string | undefined): string {
  return ("/" + (basePath ?? DEFAULT_BASE_PATH).replace(/^\/+|\/+$/g, "")).replace(/^\/$/, DEFAULT_BASE_PATH);
}

function openPersister(store: TraceStore, options: WizeLensOptions, dashboard: boolean): SqlitePersister | undefined {
  if ((options.storage ?? (dashboard ? "sqlite" : "memory")) !== "sqlite") return undefined;
  const persister = new SqlitePersister(store, {
    path: options.storagePath ?? join(process.cwd(), ".wizelens", "traces.db"),
    service: options.service,
  });
  if (!persister.open()) return undefined;
  persister.start();
  return persister;
}

function mcpSource(options: WizeLensOptions, store: TraceStore, getTrace: McpDataSource["get"], metrics: MetricStore | null, tags: readonly TagRule[]): McpDataSource {
  const thresholds = { slowQueryMs: options.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS, nPlusOneThreshold: options.nPlusOneThreshold ?? DEFAULT_N_PLUS_ONE };
  return {
    service: options.service,
    version: VERSION,
    ...thresholds,
    all: () => store.all(),
    page: memoryPages(() => store.all(), thresholds),
    get: getTrace,
    audit: options.audit ?? ((line: string) => console.info(line)),
    env: process.env.NODE_ENV || "development",
    tags: () => tags,
    ...mcpMetrics(metrics),
  };
}

function buildParts(options: WizeLensOptions, basePath: string) {
  installGlobals();
  const service = options.service;
  const tags = tagsFromOptions(options.tags);
  const redactKeys = options.redactKeys ?? DEFAULT_REDACT_KEYS;
  const sampling = samplingInfo(options.sampling);
  const sampler = sampling ? new TraceSampler(sampling) : undefined;
  const store = new TraceStore({ maxTraces: options.maxTraces ?? 2000, maxAgeMs: options.maxAgeMs, sampler });
  const dashboard = servesDashboard(options);
  const persister = openPersister(store, options, dashboard);
  const selfEndpoints = new Set<string>(options.publicEndpoint ? [options.publicEndpoint] : []);
  const fetch = options.instrumentFetch ?? true;
  const http = options.instrumentHttp ?? true;
  const tracing = createTracing(store, { service, version: VERSION, release: releaseOf(options), redactKeys, fetch, http }, selfEndpoints);
  const logs = createLogSink(store, service, redactKeys, looseLogsOf(options.logs));
  const write = createLogWriter(logs, !!options.logToConsole);
  const getTrace = createGetTrace(store, selfEndpoints);
  const startedMs = Date.now();
  const sqlite = () => !!persister?.active;
  const metrics = createMetricParts(options, redactKeys);
  const sourceMaps = localMapLoader(options.sourceMaps);
  let sendState: (() => SendState) | undefined;
  const info = () => buildInfo({ options, store, redactKeys, startedMs, sqlite, metrics: !!metrics, sourceMaps: !!sourceMaps, send: () => sendState?.() });
  const mcp = mcpSource(options, store, getTrace, metrics?.store ?? null, tags);
  const uiDir = resolveUiDir(options.uiDir);
  const hub = connectHub(options, store, info, dashboard ? selfEndpoints : null, metrics?.store ?? null);
  sendState = hub && (() => hub.sendState);
  const mcpOn = dashboard && !!options.mcp;
  const hudBundle = dashboard ? resolveHudBundle() : null;
  const trustedRemotes = trustedOrigins(options.trustedRemotes);
  const deps = { basePath, store, redactKeys, uiDir, mcpOn, mcp, info, getTrace, selfEndpoints, trustedRemotes, dashboard, sourceMaps, tags, hudBundle };
  const handler = createHandler({ ...deps, metrics: metrics?.store ?? null });
  const capture = {
    tracer: tracing.tracer,
    basePath,
    publicEndpoint: options.publicEndpoint,
    selfEndpoints,
    w3c: new W3CTraceContextPropagator(),
    captureResponseBody: !!options.captureResponseBody,
    traceStaticFiles: options.traceStaticFiles ?? envSwitch(process.env, "WIZELENS_STATIC_FILES") ?? false,
    handler,
    hudTag: hudTagFor(dashboard && hudOn(options), hudBundle, basePath, undefined, { service: `${service} (browser)`, release: releaseOf(options) }),
  };
  return { hub, service, redactKeys, store, persister, tracing, logs, write, getTrace, handler, capture, metrics, middleware: createMiddleware(capture) };
}

/** Create the WizeLens add-on for one Node service. When the auto install also runs, this instance wins. */
export function createWizeLens(options: WizeLensOptions): WizeLens {
  const wizelens = buildWizeLens(options);
  noteCodeInstall(wizelens, partsOf(wizelens));
  return wizelens;
}

/** Build an instance without telling the auto install. The auto install builds its own with this. */
export function buildWizeLens(options: WizeLensOptions): WizeLens {
  const basePath = normalizeBasePath(options.basePath);
  if (!isEnabled(options)) return disabledWizeLens(options, basePath);
  const p = buildParts(options, basePath);
  const startDbSpan = createDbSpans(p.tracing.tracer, p.redactKeys, !!options.traceQueriesOutsideRequests);
  const wizelens: WizeLens = {
    enabled: true,
    service: p.service,
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
    expected,
    setUser,
    getTrace: p.getTrace,
    shutdown: async () => {
      runCleanups(wizelens);
      await p.hub?.stop();
      p.tracing.undici?.disable();
      p.tracing.stopHttp?.();
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
