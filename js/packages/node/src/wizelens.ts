import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { TLSSocket } from "node:tls";
import {
  type Attributes as OtelAttributes,
  context,
  propagation,
  ROOT_CONTEXT,
  type Span as OtelSpan,
  SpanKind,
  SpanStatusCode,
  trace,
  type Tracer,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { AlwaysOnSampler, BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import {
  DEFAULT_BASE_PATH,
  DEFAULT_REDACT_KEYS,
  HEADER_ENDPOINT,
  HEADER_HOP,
  HEADER_TRACE,
  type LogLevel,
  MAX_FEDERATION_HOPS,
  mergeTraces,
  redactAttributes,
  redactParams,
  type Span,
  type SpanCategory,
  type SpanKind as ContractKind,
  type Trace,
  toAttributeValue,
} from "@wizeworks/lens-core";
import { handleMcp } from "./mcp.js";
import { SqlitePersister } from "./persist.js";
import { CATEGORY_ATTR, StoreSpanProcessor } from "./processor.js";
import { TraceStore } from "./store.js";
import { resolveUiDir, serveUi } from "./ui.js";

const require = createRequire(import.meta.url);
const VERSION: string = (require("../package.json") as { version: string }).version;

export interface WizeLensOptions {
  /** Service name shown in the dashboard, e.g. "orders-api". */
  serviceName: string;
  /** Base path for the dashboard and API. Default "/_wizelens". */
  basePath?: string;
  /** Turn WizeLens on. Default: on unless NODE_ENV is "production". */
  enabled?: boolean;
  /** Where traces live. "sqlite" keeps them across restarts. Default "sqlite". */
  storage?: "sqlite" | "memory";
  /** SQLite file for `storage: "sqlite"`. Default `{cwd}/.wizelens/traces.db`. */
  storagePath?: string;
  /** Max traces kept (memory and file). Default 2000. */
  maxTraces?: number;
  /** Max trace age in ms (memory and file). Default 24 h. */
  maxAgeMs?: number;
  /** Expose the read-only MCP endpoint at `{basePath}/mcp`. Default false. */
  enableMcp?: boolean;
  /** Key fragments to redact. Default: the contract list. */
  redactKeys?: string[];
  /** Override the `X-WizeLens-Endpoint` value (useful behind proxies). */
  publicEndpoint?: string;
  /** Override where the dashboard build lives. */
  uiDir?: string;
  /** Capture outgoing fetch / undici calls. Default true. */
  instrumentFetch?: boolean;
  /** Also write wizelens logs to the console. Default false. */
  logToConsole?: boolean;
  /** Where MCP audit lines go. Default console.info. */
  audit?: (line: string) => void;
}

export interface DbCallInfo {
  /** OTel `db.system.name`, e.g. "sqlite", "postgresql", "mysql". */
  system: string;
  /** Adapter name for `wizelens.db.adapter`, e.g. "node-sqlite", "pg", "prisma". */
  adapter?: string;
  /** Database name for `db.namespace`. */
  namespace?: string;
  /** Override the parsed operation (SELECT, INSERT, ...). */
  operation?: string;
  /** Override the parsed table / collection. */
  collection?: string;
}

export type LogFn = (message: string, attributes?: Record<string, unknown>) => void;

export interface WizeLensLogger {
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  critical: LogFn;
  /** Logger with a custom category. */
  child(category: string): WizeLensLogger;
}

type Next = (err?: unknown) => void;
type Req = IncomingMessage & { originalUrl?: string; body?: unknown; route?: { path?: unknown }; baseUrl?: string };

export interface WizeLens {
  readonly enabled: boolean;
  readonly serviceName: string;
  readonly basePath: string;
  readonly store: TraceStore;
  /** The SQLite file in use, or null when traces are kept in memory only. */
  readonly storagePath: string | null;
  readonly tracer: Tracer;
  /** Express / Connect middleware. Traces requests and serves `{basePath}`. Mount it first. */
  middleware: (req: IncomingMessage, res: ServerResponse, next: Next) => void;
  /** Express error middleware. Mount it after your routes to record exceptions. */
  errorMiddleware: (err: unknown, req: IncomingMessage, res: ServerResponse, next: Next) => void;
  /** Plain Node handler for `{basePath}` only. Resolves false when the request is not for WizeLens. */
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  /** Wrap one database call (sync or async). Driver-level floor for any database. */
  traceDb<T>(info: DbCallInfo, sql: string, params: unknown, fn: () => T): T;
  logger: WizeLensLogger;
  /** Record an exception on the active span. */
  recordException(err: unknown): void;
  /** Get one trace, optionally federated across downstream services. */
  getTrace(traceId: string, federate?: boolean, hop?: number): Promise<Trace | undefined>;
  shutdown(): Promise<void>;
}

const SPAN = Symbol.for("wizeworks.wizelens.span");
const SPAN_KINDS: readonly ContractKind[] = ["server", "client", "internal", "producer", "consumer"];
const CATEGORIES: readonly SpanCategory[] = ["http.server", "http.client", "db", "browser", "internal"];
const HEX32 = /^[0-9a-f]{32}$/;
const HEX16 = /^[0-9a-f]{16}$/;
const MAX_BODY = 5 * 1024 * 1024;

let globalsInstalled = false;
function installGlobals(): void {
  if (globalsInstalled) return;
  globalsInstalled = true;
  // Both return false when an app already set its own. That is fine: we only need some ALS manager and W3C.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
}

const now = () => performance.timeOrigin + performance.now();

function toOtelAttributes(attrs: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!attrs) return out;
  for (const [k, v] of Object.entries(attrs)) {
    const value = toAttributeValue(v);
    if (value !== null) out[k] = value;
  }
  return out;
}

function recordOn(span: OtelSpan, err: unknown): void {
  const error = err instanceof Error ? err : new Error(String(err));
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.split(",")[0]?.trim() || undefined;
}

function appendExposeHeaders(res: ServerResponse): void {
  const existing = res.getHeader("Access-Control-Expose-Headers");
  const parts = new Set(
    String(Array.isArray(existing) ? existing.join(",") : (existing ?? ""))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  parts.add(HEADER_TRACE);
  parts.add(HEADER_ENDPOINT);
  res.setHeader("Access-Control-Expose-Headers", [...parts].join(", "));
}

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function readJson(req: Req): Promise<unknown> {
  if (req.body !== undefined && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buf.length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
}

/** Undici request headers are a `name: value\r\n` string (v5) or a flat array (v6+). */
function hasRequestHeader(headers: string | (string | string[])[], name: string): boolean {
  if (typeof headers === "string") return headers.toLowerCase().includes(`${name.toLowerCase()}:`);
  for (let i = 0; i < headers.length; i += 2) if (String(headers[i]).toLowerCase() === name.toLowerCase()) return true;
  return false;
}

function responseHeader(headers: Buffer[], name: string): string | undefined {
  const lower = name.toLowerCase();
  for (let i = 0; i + 1 < headers.length; i += 2) {
    if (headers[i]!.toString("latin1").toLowerCase() === lower) return headers[i + 1]!.toString("latin1");
  }
  return undefined;
}

function parseSql(sql: string): { operation: string; collection: string | undefined } {
  const operation = (/^\s*(\w+)/.exec(sql)?.[1] ?? "QUERY").toUpperCase();
  const collection = /\b(?:FROM|INTO|UPDATE|JOIN)\s+["`[]?([\w.]+)/i.exec(sql)?.[1];
  return { operation, collection };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

function sanitizeClientSpan(raw: unknown, redactKeys: readonly string[]): Span | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.traceId !== "string" || !HEX32.test(s.traceId)) return null;
  if (typeof s.spanId !== "string" || !HEX16.test(s.spanId)) return null;
  const parent = typeof s.parentSpanId === "string" && HEX16.test(s.parentSpanId) ? s.parentSpanId : null;
  const attrs = s.attributes && typeof s.attributes === "object" ? (s.attributes as Record<string, unknown>) : {};
  const attributes: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(attrs)) attributes[k] = toAttributeValue(v);
  const events = Array.isArray(s.events) ? s.events : [];
  return {
    traceId: s.traceId,
    spanId: s.spanId,
    parentSpanId: parent,
    name: typeof s.name === "string" ? s.name.slice(0, 500) : "browser",
    kind: SPAN_KINDS.includes(s.kind as ContractKind) ? (s.kind as ContractKind) : "client",
    category: CATEGORIES.includes(s.category as SpanCategory) ? (s.category as SpanCategory) : "browser",
    service: typeof s.service === "string" && s.service ? s.service.slice(0, 100) : "browser",
    startMs: Number(s.startMs) || 0,
    durationMs: Math.max(0, Number(s.durationMs) || 0),
    status: s.status === "error" || s.status === "ok" ? s.status : "unset",
    statusMessage: typeof s.statusMessage === "string" ? s.statusMessage : null,
    attributes: redactAttributes(attributes, redactKeys),
    events: events.slice(0, 50).flatMap((e) => {
      if (!e || typeof e !== "object") return [];
      const ev = e as Record<string, unknown>;
      const evAttrs: Record<string, string | number | boolean | null> = {};
      if (ev.attributes && typeof ev.attributes === "object") {
        for (const [k, v] of Object.entries(ev.attributes as Record<string, unknown>)) evAttrs[k] = toAttributeValue(v);
      }
      return [{ name: String(ev.name ?? "event"), timeMs: Number(ev.timeMs) || 0, attributes: redactAttributes(evAttrs, redactKeys) }];
    }),
  };
}

function disabledWizeLens(options: WizeLensOptions, basePath: string): WizeLens {
  const noop: LogFn = () => {};
  const logger: WizeLensLogger = { trace: noop, debug: noop, info: noop, warn: noop, error: noop, critical: noop, child: () => logger };
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
    logger,
    recordException: () => {},
    getTrace: async () => undefined,
    shutdown: async () => {},
  };
}

/** Create the WizeLens add-on for one Node service. */
export function createWizeLens(options: WizeLensOptions): WizeLens {
  const basePath = ("/" + (options.basePath ?? DEFAULT_BASE_PATH).replace(/^\/+|\/+$/g, "")).replace(/^\/$/, DEFAULT_BASE_PATH);
  const enabled = options.enabled ?? process.env.NODE_ENV !== "production";
  if (!enabled) return disabledWizeLens(options, basePath);

  installGlobals();
  const service = options.serviceName;
  const redactKeys = options.redactKeys ?? DEFAULT_REDACT_KEYS;
  const store = new TraceStore({ maxTraces: options.maxTraces ?? 2000, maxAgeMs: options.maxAgeMs });
  let persister: SqlitePersister | undefined;
  if ((options.storage ?? "sqlite") === "sqlite") {
    persister = new SqlitePersister(store, {
      path: options.storagePath ?? join(process.cwd(), ".wizelens", "traces.db"),
      serviceName: options.serviceName,
    });
    if (persister.open()) persister.start();
    else persister = undefined;
  }
  const audit = options.audit ?? ((line: string) => console.info(line));
  const uiDir = resolveUiDir(options.uiDir);
  const selfEndpoints = new Set<string>();
  if (options.publicEndpoint) selfEndpoints.add(options.publicEndpoint);
  const w3c = new W3CTraceContextPropagator();

  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({ "service.name": service }),
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new StoreSpanProcessor(store, service, redactKeys)],
  });
  const tracer = provider.getTracer("@wizeworks/lens-node", VERSION);

  let undici: UndiciInstrumentation | undefined;
  if (options.instrumentFetch ?? true) {
    undici = new UndiciInstrumentation({
      requireParentforSpans: true,
      // Federation calls carry X-WizeLens-Hop. Do not trace WizeLens talking to itself.
      ignoreRequestHook: (request) => hasRequestHeader(request.headers, HEADER_HOP),
      responseHook: (span, { response }) => {
        const endpoint = responseHeader(response.headers, HEADER_ENDPOINT);
        if (endpoint && !selfEndpoints.has(endpoint)) store.addRemote(span.spanContext().traceId, endpoint);
      },
    });
    undici.setTracerProvider(provider);
  }

  function endpointFor(req: IncomingMessage): string {
    if (options.publicEndpoint) return options.publicEndpoint;
    const proto = firstHeader(req.headers["x-forwarded-proto"]) ?? ((req.socket as TLSSocket).encrypted ? "https" : "http");
    const host = firstHeader(req.headers["x-forwarded-host"]) ?? req.headers.host ?? "localhost";
    return `${proto}://${host}${basePath}`;
  }

  function log(level: LogLevel, category: string, message: string, attributes?: Record<string, unknown>): void {
    if (options.logToConsole) {
      const fn = level === "error" || level === "critical" ? console.error : level === "warn" ? console.warn : console.log;
      fn(`[${level}] ${category}: ${message}`);
    }
    const span = trace.getSpan(context.active());
    if (!span) return;
    const sc = span.spanContext();
    store.addLog(sc.traceId, {
      timeMs: now(),
      level,
      category,
      message,
      service,
      spanId: sc.spanId,
      attributes: redactAttributes(toOtelAttributes(attributes), redactKeys),
    });
  }

  function makeLogger(category: string): WizeLensLogger {
    const at = (level: LogLevel): LogFn => (message, attributes) => log(level, category, message, attributes);
    return {
      trace: at("trace"),
      debug: at("debug"),
      info: at("info"),
      warn: at("warn"),
      error: at("error"),
      critical: at("critical"),
      child: (c) => makeLogger(c),
    };
  }

  async function getTrace(traceId: string, federate = true, hop = 0): Promise<Trace | undefined> {
    const local = store.get(traceId);
    if (!federate || hop + 1 > MAX_FEDERATION_HOPS) return local;
    const remotes = (local?.remotes ?? []).filter((r) => !selfEndpoints.has(r));
    const parts = await Promise.all(
      remotes.map(async (remote) => {
        try {
          const res = await context.with(ROOT_CONTEXT, () =>
            fetch(`${remote}/api/traces/${traceId}?federate=true`, {
              headers: { [HEADER_HOP]: String(hop + 1), Accept: "application/json" },
              signal: AbortSignal.timeout(2000),
            }),
          );
          return res.ok ? ((await res.json()) as Trace) : undefined;
        } catch {
          return undefined;
        }
      }),
    );
    const all = [local, ...parts].filter((t): t is Trace => !!t && Array.isArray(t.spans));
    if (all.length === 0) return undefined;
    return mergeTraces(traceId, all);
  }

  const mcpData = {
    service,
    version: VERSION,
    list: (limit: number) => store.list(limit),
    all: () => store.all(),
    get: (traceId: string, federate: boolean) => getTrace(traceId, federate),
    audit,
  };

  async function handler(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const r = req as Req;
    const url = new URL(r.originalUrl ?? r.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (path !== basePath && !path.startsWith(basePath + "/")) return false;
    if (path === basePath) {
      res.writeHead(302, { Location: `${basePath}/${url.search}` });
      res.end();
      return true;
    }
    const sub = path.slice(basePath.length + 1);
    const method = req.method ?? "GET";
    setCors(res);
    if (method === "OPTIONS") {
      res.writeHead(204).end();
      return true;
    }
    if (sub === "mcp") {
      if (!options.enableMcp) {
        sendJson(res, 404, { error: "MCP is disabled. Set enableMcp: true." });
        return true;
      }
      const body = method === "POST" ? await readJson(r) : undefined;
      await handleMcp(mcpData, req, res, body);
      return true;
    }
    if (sub === "api/info" && method === "GET") {
      sendJson(res, 200, { service, version: VERSION, runtime: `node ${process.version}`, mcp: !!options.enableMcp });
      return true;
    }
    if (sub === "api/traces" && method === "GET") {
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit")) || 50));
      const session = url.searchParams.get("session") || undefined;
      sendJson(res, 200, store.list(limit, session));
      return true;
    }
    const traceMatch = /^api\/traces\/([0-9a-f]{32})$/.exec(sub);
    if (traceMatch && method === "GET") {
      const hop = Number(firstHeader(req.headers[HEADER_HOP.toLowerCase()])) || 0;
      const result = await getTrace(traceMatch[1]!, url.searchParams.get("federate") === "true", hop);
      if (result) sendJson(res, 200, result);
      else sendJson(res, 404, { error: "trace not found" });
      return true;
    }
    if (sub === "api/client-spans" && method === "POST") {
      try {
        const body = (await readJson(r)) as { spans?: unknown } | undefined;
        const spans = Array.isArray(body?.spans) ? body.spans.slice(0, 500) : [];
        for (const raw of spans) {
          const span = sanitizeClientSpan(raw, redactKeys);
          if (span) store.addSpan(span);
        }
        res.writeHead(204).end();
      } catch {
        sendJson(res, 400, { error: "invalid body" });
      }
      return true;
    }
    if (sub.startsWith("api/")) {
      sendJson(res, 404, { error: "not found" });
      return true;
    }
    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405).end();
      return true;
    }
    await serveUi(uiDir, sub, res);
    return true;
  }

  function middleware(req: IncomingMessage, res: ServerResponse, next: Next): void {
    const r = req as Req;
    const rawUrl = r.originalUrl ?? r.url ?? "/";
    const path = rawUrl.split("?")[0] ?? "/";
    if (path === basePath || path.startsWith(basePath + "/")) {
      handler(req, res).catch((err) => {
        if (!res.headersSent) sendJson(res, 500, { error: String(err) });
        else res.end();
      });
      return;
    }

    const method = req.method ?? "GET";
    const parentCtx = w3c.extract(ROOT_CONTEXT, req.headers, {
      get: (carrier, key) => carrier[key],
      keys: (carrier) => Object.keys(carrier),
    });
    const host = req.headers.host ?? "";
    const query = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
    const attributes: OtelAttributes = {
      [CATEGORY_ATTR]: "http.server",
      "http.request.method": method,
      "url.path": path,
      "server.address": host.split(":")[0] ?? host,
    };
    if (query) attributes["url.query"] = query;
    const ua = req.headers["user-agent"];
    if (ua) attributes["user_agent.original"] = ua;

    const span = tracer.startSpan(`${method} ${path}`, { kind: SpanKind.SERVER, attributes }, parentCtx);
    const endpoint = endpointFor(req);
    selfEndpoints.add(endpoint);
    res.setHeader(HEADER_TRACE, span.spanContext().traceId);
    res.setHeader(HEADER_ENDPOINT, endpoint);
    appendExposeHeaders(res);
    (req as unknown as Record<symbol, OtelSpan>)[SPAN] = span;

    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      span.setAttribute("http.response.status_code", res.statusCode);
      const routePath = r.route?.path;
      if (typeof routePath === "string") {
        const route = `${r.baseUrl ?? ""}${routePath}`;
        span.setAttribute("http.route", route);
        span.updateName(`${method} ${route}`);
      }
      if (res.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${res.statusCode}` });
      span.end();
    };
    res.once("finish", finish);
    res.once("close", finish);

    context.with(trace.setSpan(parentCtx, span), () => {
      try {
        next();
      } catch (err) {
        recordOn(span, err);
        throw err;
      }
    });
  }

  function errorMiddleware(err: unknown, req: IncomingMessage, _res: ServerResponse, next: Next): void {
    const span = (req as unknown as Record<symbol, OtelSpan | undefined>)[SPAN] ?? trace.getSpan(context.active());
    if (span) recordOn(span, err);
    log("error", service, err instanceof Error ? err.message : String(err));
    next(err);
  }

  function traceDb<T>(info: DbCallInfo, sql: string, params: unknown, fn: () => T): T {
    const parsed = parseSql(sql);
    const operation = info.operation ?? parsed.operation;
    const collection = info.collection ?? parsed.collection;
    const attributes: OtelAttributes = {
      [CATEGORY_ATTR]: "db",
      "db.system.name": info.system,
      "db.query.text": sql,
      "db.operation.name": operation,
      "wizelens.db.adapter": info.adapter ?? info.system,
    };
    if (collection) attributes["db.collection.name"] = collection;
    if (info.namespace) attributes["db.namespace"] = info.namespace;
    const p = redactParams(params, redactKeys);
    if (p !== null) attributes["wizelens.db.parameters"] = p;

    const span = tracer.startSpan(collection ? `${operation} ${collection}` : operation, { kind: SpanKind.CLIENT, attributes });
    const done = <R>(result: R): R => {
      if (Array.isArray(result)) span.setAttribute("db.response.returned_rows", result.length);
      span.end();
      return result;
    };
    const fail = (err: unknown): never => {
      recordOn(span, err);
      span.end();
      throw err;
    };
    try {
      const result = context.with(trace.setSpan(context.active(), span), fn);
      if (isThenable(result)) return Promise.resolve(result).then(done, fail) as T;
      return done(result);
    } catch (err) {
      return fail(err);
    }
  }

  return {
    enabled: true,
    serviceName: service,
    basePath,
    store,
    get storagePath() {
      return persister?.active ? persister.path : null;
    },
    tracer,
    middleware,
    errorMiddleware,
    handler,
    traceDb,
    logger: makeLogger(service),
    recordException: (err) => {
      const span = trace.getSpan(context.active());
      if (span) recordOn(span, err);
    },
    getTrace,
    shutdown: async () => {
      undici?.disable();
      await provider.shutdown();
      persister?.close();
    },
  };
}
