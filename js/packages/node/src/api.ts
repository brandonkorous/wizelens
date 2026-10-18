import type { IncomingMessage, ServerResponse } from "node:http";
import { HEADER_HOP, type ServiceInfo, type Trace, type TraceSummary } from "@wizeworks/lens-core";
import { remoteOf, sanitizeClientLog, sanitizeClientSpan } from "./client-spans.js";
import { firstHeader, readJson, sendJson, setCors } from "./http-util.js";
import { handleMcp, type McpDataSource } from "./mcp.js";
import type { MetricStore } from "./metrics/store.js";
import type { TraceStore } from "./store.js";
import type { Req } from "./types.js";
import { serveUi } from "./ui.js";

const MAX_CLIENT_SPANS = 500;
const MAX_CLIENT_LOGS = 100;

export interface ApiDeps {
  basePath: string;
  store: TraceStore;
  redactKeys: readonly string[];
  uiDir: string | null;
  enableMcp: boolean;
  mcp: McpDataSource;
  info: () => ServiceInfo;
  getTrace: (traceId: string, federate: boolean, hop: number) => Promise<Trace | undefined>;
  /** Null when metrics are off. */
  metrics?: MetricStore | null;
  /** This service's own endpoints: never a remote of its own traces. */
  selfEndpoints: ReadonlySet<string>;
  /** False is send-only: only the browser span intake answers. */
  dashboard: boolean;
}

const CLIENT_SPANS = "api/client-spans";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** `api/traces`: summaries by default, full local traces with `full=true` (and `since`). */
export function listTraces(store: TraceStore, params: URLSearchParams): TraceSummary[] | Trace[] {
  const full = params.get("full") === "true";
  const session = params.get("session") || undefined;
  const limit = clamp(Number(params.get("limit")) || (full ? 1000 : 50), 1, full ? 5000 : 1000);
  if (!full) return store.list(limit, session);
  const since = Number(params.get("since"));
  const all = store.all(session);
  const recent = params.has("since") && Number.isFinite(since) ? all.filter((t) => t.startMs + t.durationMs >= since) : all;
  return recent.slice(0, limit);
}

async function sendTrace(d: ApiDeps, traceId: string, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const hop = Number(firstHeader(req.headers[HEADER_HOP.toLowerCase()])) || 0;
  const result = await d.getTrace(traceId, url.searchParams.get("federate") === "true", hop);
  if (result) sendJson(res, 200, result);
  else sendJson(res, 404, { error: "trace not found" });
}

async function receiveClientSpans(d: ApiDeps, req: Req, res: ServerResponse): Promise<void> {
  try {
    const body = (await readJson(req)) as { spans?: unknown; logs?: unknown } | undefined;
    const spans = Array.isArray(body?.spans) ? body.spans.slice(0, MAX_CLIENT_SPANS) : [];
    const origin = firstHeader(req.headers.origin);
    for (const raw of spans) {
      const span = sanitizeClientSpan(raw, d.redactKeys);
      if (!span) continue;
      d.store.addSpan(span);
      const remote = remoteOf(span, origin);
      if (remote && !d.selfEndpoints.has(remote)) d.store.addRemote(span.traceId, remote);
    }
    const logs = Array.isArray(body?.logs) ? body.logs.slice(0, MAX_CLIENT_LOGS) : [];
    for (const raw of logs) {
      const entry = sanitizeClientLog(raw, d.redactKeys);
      if (entry) d.store.addLog(entry.traceId, entry.log);
    }
    res.writeHead(204).end();
  } catch {
    sendJson(res, 400, { error: "invalid body" });
  }
}

async function handleApi(d: ApiDeps, sub: string, method: string, req: Req, res: ServerResponse, url: URL): Promise<void> {
  if (sub === "api/info" && method === "GET") return sendJson(res, 200, d.info());
  if (sub === "api/traces" && method === "GET") return sendJson(res, 200, listTraces(d.store, url.searchParams));
  const traceMatch = /^api\/traces\/([0-9a-f]{32})$/.exec(sub);
  if (traceMatch && method === "GET") return sendTrace(d, traceMatch[1]!, req, res, url);
  if (sub === CLIENT_SPANS && method === "POST") return receiveClientSpans(d, req, res);
  if (sub === "api/metrics/points" && method === "GET" && d.metrics) {
    const since = Number(url.searchParams.get("since"));
    return sendJson(res, 200, { points: d.metrics.since(Number.isFinite(since) ? since : 0) });
  }
  sendJson(res, 404, { error: "not found" });
}

async function handleMcpRoute(d: ApiDeps, req: Req, res: ServerResponse, method: string): Promise<void> {
  if (!d.enableMcp) return sendJson(res, 404, { error: "MCP is disabled. Set enableMcp: true." });
  const body = method === "POST" ? await readJson(req) : undefined;
  await handleMcp(d.mcp, req, res, body);
}

/** Plain Node handler for `{basePath}`: API, MCP, and the dashboard, or only the browser span intake when send-only. Resolves false for other paths. */
export function createHandler(d: ApiDeps) {
  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const r = req as Req;
    const url = new URL(r.originalUrl ?? r.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (path !== d.basePath && !path.startsWith(d.basePath + "/")) return false;
    const sub = path.slice(d.basePath.length + 1);
    const method = req.method ?? "GET";
    // Send-only: nothing here can be read, so traces never leave the service except to the hub.
    if (!d.dashboard && sub !== CLIENT_SPANS) {
      sendJson(res, 404, { error: "not found" });
      return true;
    }
    if (path === d.basePath) {
      res.writeHead(302, { Location: `${d.basePath}/${url.search}` });
      res.end();
      return true;
    }
    setCors(res);
    if (method === "OPTIONS") res.writeHead(204).end();
    else if (sub === "mcp") await handleMcpRoute(d, r, res, method);
    else if (sub.startsWith("api/")) await handleApi(d, sub, method, r, res, url);
    else if (method !== "GET" && method !== "HEAD") res.writeHead(405).end();
    else await serveUi(d.uiDir, sub, res);
    return true;
  };
}
