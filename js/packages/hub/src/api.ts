import { hostname } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import { annotateErrorFrames, HEADER_HOP, type ServiceInfo, SOURCEMAPS_PATH, SOURCEMAPS_RESOLVE_PATH } from "@wizeworks/lens-core";
import { DEFAULT_N_PLUS_ONE, DEFAULT_SLOW_QUERY_MS, firstHeader, sendJson, VERSION as NODE_VERSION } from "@wizeworks/lens-node/kit";
import { parseJson, readBody } from "./body.js";
import type { HubData } from "./data.js";
import { parseIngest } from "./ingest.js";
import type { ResolvedHubOptions } from "./options.js";
import { metricParams, metricsPage, rangeOf } from "./metrics-read.js";
import { sendPageModel } from "./models-api.js";
import { streamChanges } from "./changes-api.js";
import { sendSearch, sendSuggest } from "./search-api.js";
import { type HubMaps, listMaps, resolveMaps, uploadSourceMap } from "./sourcemaps-api.js";
import { countRows, distinctOf, listServices, type TraceQuery } from "./store-read.js";

export interface ApiContext {
  data: HubData;
  o: ResolvedHubOptions;
  version: string;
  startedMs: number;
  /** Source maps per project: uploads, build folders, and dev servers. */
  maps: HubMaps;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const num = (p: URLSearchParams, k: string) => (p.has(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : undefined);

export function hubInfo(c: ApiContext): ServiceInfo {
  return {
    mode: "hub",
    capabilities: ["federation", "environments", "registry", "metrics", "serverMetrics", "serverStats", "search", "changes", "sourcemaps"],
    service: c.o.name,
    version: c.version,
    runtime: `node ${process.version} · lens-node ${NODE_VERSION}`,
    mcp: c.o.enableMcp,
    host: hostname(),
    startedMs: c.startedMs,
    storage: { kind: "sqlite", maxTraces: c.o.maxTraces, maxAgeMs: c.o.maxAgeMs },
    analysis: { slowQueryMs: DEFAULT_SLOW_QUERY_MS, nPlusOneThreshold: DEFAULT_N_PLUS_ONE },
    redactKeys: [...c.o.redactKeys],
  };
}

/** `api/traces`: summaries by default, full traces with `full=true`. Filters: since, before, env, project, session. */
export function queryOf(p: URLSearchParams): { q: TraceQuery; full: boolean } {
  const full = p.get("full") === "true";
  const limit = clamp(num(p, "limit") ?? (full ? 1000 : 50), 1, full ? 5000 : 1000);
  const q: TraceQuery = { limit, since: num(p, "since"), before: num(p, "before") };
  for (const k of ["env", "project", "session"] as const) q[k] = p.get(k) || undefined;
  return { q, full };
}

function services(c: ApiContext) {
  const db = c.data.store.db;
  return {
    services: listServices(db, c.o.now()),
    environments: distinctOf(db, "env"),
    projects: distinctOf(db, "project"),
    ...countRows(db),
  };
}

async function ingest(c: ApiContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const w = parseIngest(parseJson(await readBody(req)), c.o.redactKeys);
    if (!w) return sendJson(res, 400, { error: "sender.service is required" });
    await annotateErrorFrames(w.spans, c.maps(w.sender.project ?? ""));
    c.data.write(w);
    res.writeHead(204).end();
  } catch {
    sendJson(res, 400, { error: "invalid body" });
  }
}

function metrics(c: ApiContext, p: URLSearchParams) {
  const scope = { project: p.get("project") || undefined, env: p.get("env") || undefined };
  return metricsPage(c.data.store.db, rangeOf(p.get("range")), scope, metricParams(p), c.o.now());
}

async function sendTrace(c: ApiContext, traceId: string, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const hop = Number(firstHeader(req.headers[HEADER_HOP.toLowerCase()])) || 0;
  const t = await c.data.getTrace(traceId, url.searchParams.get("federate") === "true", hop);
  if (t) sendJson(res, 200, t);
  else sendJson(res, 404, { error: "trace not found" });
}

/** The hub API below `/_wizelens/`. */
export async function handleApi(c: ApiContext, sub: string, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const method = req.method ?? "GET";
  if (sub === "api/info" && method === "GET") return sendJson(res, 200, hubInfo(c));
  if (sub === "api/services" && method === "GET") return sendJson(res, 200, services(c));
  if (sub === "api/ingest" && method === "POST") return ingest(c, req, res);
  if (sub === SOURCEMAPS_PATH && method === "POST") return uploadSourceMap(c.data.store.db, c.o.now(), req, res, url);
  if (sub === SOURCEMAPS_PATH && method === "GET") return listMaps(c.data.store.db, res, url);
  if (sub === SOURCEMAPS_RESOLVE_PATH && method === "POST") return resolveMaps(c.maps, req, res, url);
  if (sub === "api/traces" && method === "GET") {
    const { q, full } = queryOf(url.searchParams);
    return sendJson(res, 200, full ? c.data.traces(q) : c.data.summaries(q));
  }
  if (sub === "api/search" && method === "GET") return sendSearch(c, url.searchParams, res);
  if (sub === "api/changes" && method === "GET") return streamChanges(c, req, res);
  if (sub === "api/search/suggest" && method === "GET") return sendSuggest(c, url.searchParams, res);
  if (sub === "api/models/metrics" && method === "GET") return sendJson(res, 200, metrics(c, url.searchParams));
  if (sub.startsWith("api/models/") && method === "GET") return sendPageModel(c, sub.slice("api/models/".length), url.searchParams, res);
  const m = /^api\/traces\/([0-9a-f]{32})$/.exec(sub);
  if (m && method === "GET") return sendTrace(c, m[1]!, req, res, url);
  sendJson(res, 404, { error: "not found" });
}
