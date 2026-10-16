// Small builders for test traces. Test-only: excluded from the build.
import { ATTR_BROWSER_TYPE } from "../attributes.js";
import { newSpanId, newTraceId } from "../ids.js";
import { buildTrace } from "../trace.js";
import type { Attributes, LogRecord, Span, Trace } from "../types.js";

let clock = 1_700_000_000_000;

export function makeSpan(partial: Partial<Span> & Pick<Span, "category">): Span {
  const startMs = partial.startMs ?? (clock += 10);
  return {
    traceId: partial.traceId ?? "a".repeat(32),
    spanId: partial.spanId ?? newSpanId(),
    parentSpanId: partial.parentSpanId ?? null,
    name: partial.name ?? partial.category,
    kind: partial.kind ?? "internal",
    category: partial.category,
    service: partial.service ?? "api",
    startMs,
    durationMs: partial.durationMs ?? 5,
    status: partial.status ?? "unset",
    statusMessage: partial.statusMessage ?? null,
    attributes: partial.attributes ?? {},
    events: partial.events ?? [],
  };
}

export interface RequestFixture {
  startMs?: number;
  method?: string;
  path?: string;
  route?: string;
  status?: number;
  serverMs?: number;
  service?: string;
  queries?: { sql: string; ms: number; params?: string }[];
  fetchMs?: number;
  renderMs?: number;
  error?: { type: string; message: string };
  attributes?: Attributes;
  logs?: Omit<LogRecord, "service" | "spanId">[];
}

function exceptionEvents(error: RequestFixture["error"], timeMs: number): Span["events"] {
  if (!error) return [];
  const attributes = { "exception.type": error.type, "exception.message": error.message, "exception.stacktrace": `${error.type}: ${error.message}\n    at handler (app.ts:1:1)` };
  return [{ name: "exception", timeMs, attributes }];
}

/** One request trace: optional browser fetch, a server span, and its queries. */
export function makeRequest(f: RequestFixture = {}): Trace {
  const traceId = newTraceId();
  const startMs = f.startMs ?? (clock += 1000);
  const serverMs = f.serverMs ?? 50;
  const service = f.service ?? "api";
  const server = makeSpan({
    traceId, category: "http.server", kind: "server", service, startMs: startMs + 2, durationMs: serverMs,
    name: `${f.method ?? "GET"} ${f.route ?? f.path ?? "/api/items"}`,
    status: f.error || (f.status ?? 200) >= 500 ? "error" : "unset",
    attributes: { "http.request.method": f.method ?? "GET", "url.path": f.path ?? "/api/items", "http.response.status_code": f.status ?? 200, ...(f.route ? { "http.route": f.route } : {}), ...f.attributes },
    events: exceptionEvents(f.error, startMs + serverMs),
  });
  const spans = [server];
  let at = startMs + 3;
  for (const q of f.queries ?? []) {
    const attributes: Attributes = { "db.system.name": "sqlite", "db.query.text": q.sql, ...(q.params ? { "wizelens.db.parameters": q.params } : {}) };
    spans.push(makeSpan({ traceId, category: "db", kind: "client", service, parentSpanId: server.spanId, startMs: at, durationMs: q.ms, name: q.sql.split(" ")[0], attributes }));
    at += q.ms;
  }
  if (f.fetchMs !== undefined) {
    const attributes: Attributes = { [ATTR_BROWSER_TYPE]: "fetch", "http.request.method": f.method ?? "GET", "url.full": `http://app.test${f.path ?? "/api/items"}`, "http.response.status_code": f.status ?? 200, ...(f.renderMs !== undefined ? { "wizelens.browser.render_ms": f.renderMs } : {}) };
    spans.push(makeSpan({ traceId, category: "browser", kind: "client", service: "browser", startMs, durationMs: f.fetchMs, name: `fetch ${f.path ?? "/api/items"}`, attributes }));
  }
  const logs = (f.logs ?? []).map((l) => ({ ...l, service, spanId: server.spanId }));
  return buildTrace(traceId, spans, logs, []);
}
