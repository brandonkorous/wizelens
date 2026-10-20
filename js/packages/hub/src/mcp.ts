import { type PageName, searchSql, SQLITE_DIALECT, suggestSql, type Trace } from "@wizeworks/lens-core";
import type { McpDataSource, McpProject, McpProjects } from "@wizeworks/lens-node/kit";
import { listEvents, listRules } from "./alerts/store.js";
import type { HubData } from "./data.js";
import { metricsPage } from "./metrics-read.js";
import { hubPage } from "./models-api.js";
import { sqliteRunner, sqlScopeOf } from "./scale-exec.js";
import { factsOf } from "./settings.js";
import { distinctOf, loadTraces } from "./store-read.js";
import { hubTags } from "./tags.js";

/** Recent traces the MCP tools read whole, and unsettled ones they add to store searches. */
const MCP_RECENT = 2000;
const ALERT_EVENTS = 50;
/** What the default project (no project set) is called in list_projects. */
const DEFAULT_PROJECT = "default";

interface HubMcpInfo {
  name: string;
  version: string;
  audit: (line: string) => void;
}

/** Traces written since they last settled: the store's search does not have them yet. */
function unsettled(data: HubData, project: string | undefined): Trace[] {
  const where = project === undefined ? "" : " AND project = ?";
  const ids = (data.store.db.prepare(`SELECT trace_id FROM traces WHERE settled_ms < updated_ms${where} ORDER BY start_ms DESC LIMIT ?`).all(...(project === undefined ? [] : [project]), MCP_RECENT) as { trace_id: string }[]).map((r) => r.trace_id);
  return loadTraces(data.store.db, ids, data.keepRemote);
}

/** The hub's data for one project, or for all of it when `project` is undefined. */
function scopedSource(data: HubData, project: string | undefined, info: HubMcpInfo): McpDataSource {
  const store = data.store;
  const scope = project === undefined ? {} : { project };
  const src = { d: SQLITE_DIALECT, run: sqliteRunner(store.db), scope: sqlScopeOf(scope) };
  const facts = factsOf(store, project ?? "");
  return {
    service: project ? `${info.name} · ${project}` : info.name,
    version: info.version,
    slowQueryMs: facts.slowQueryMs!,
    nPlusOneThreshold: facts.nPlusOneThreshold!,
    all: () => data.traces({ limit: MCP_RECENT, project }),
    unsettled: () => unsettled(data, project),
    get: (traceId, federate) => data.getTrace(traceId, federate),
    audit: info.audit,
    metrics: (range, params) => metricsPage(store.db, range, scope, params, store.now()),
    search: (q) => searchSql(src, q),
    suggest: (r) => suggestSql(src, r),
    now: () => store.now(),
    page: <P extends PageName>(page: P, range: Parameters<typeof hubPage>[2], params: Record<string, string> = {}) => hubPage(data, page, range, scope, params),
    alerts: async () => ({ rules: listRules(store.db, project ?? ""), events: listEvents(store.db, project ?? "", ALERT_EVENTS) }),
    tags: () => hubTags(store.db),
  };
}

/** The hub's projects: the named ones, and the default one when traces have none. */
function hubProjects(data: HubData): McpProject[] {
  const named = distinctOf(data.store.db, "project").map((p) => ({ id: p, name: p }));
  const unnamed = data.store.db.prepare("SELECT 1 FROM traces WHERE project = '' LIMIT 1").get() !== undefined;
  return [...named, ...(unnamed ? [{ id: "", name: DEFAULT_PROJECT }] : [])];
}

/** One project: tools read it. Several: tools take `project`, and list_projects names them, as on the cloud. */
export function hubMcpSource(data: HubData, name: string, version: string, audit: (line: string) => void): McpDataSource | McpProjects {
  const info = { name, version, audit };
  const projects = hubProjects(data);
  if (projects.length <= 1) return scopedSource(data, projects[0]?.id, info);
  return {
    service: name,
    version,
    slowQueryMs: data.store.slowQueryMs,
    nPlusOneThreshold: data.store.nPlusOneThreshold,
    metrics: true,
    overview: true,
    alerts: true,
    projects,
    open: async (projectId) => scopedSource(data, projectId, info),
    audit,
  };
}
