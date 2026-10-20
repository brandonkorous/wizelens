// MCP over every project a reader has, read together (the cloud's "All projects"): one scope, services shown as "service · project".
import type { Trace } from "@wizeworks/lens-core";
import type { McpDataSource } from "@wizeworks/lens-node/kit";
import type { Ctx } from "../app.js";
import { listEvents } from "../repo/alert-events.js";
import { listRules } from "../repo/alerts.js";
import { audit } from "../repo/audit.js";
import type { Project } from "../repo/projects.js";
import { tenantScope } from "../telemetry/store.js";
import { projectMetrics } from "./metrics.js";
import { scopePage } from "./models.js";
import { projectLabels, scopeFacts } from "./scope.js";
import { scopeTags } from "./scope-state.js";

const MCP_RECENT = 500;
const ALERT_EVENTS = 50;

/** Who reads, for the audit log. */
export interface AllReader {
  orgId: string;
  actor: string;
  via?: string;
}

/** Every project of `projects` (already the reader's own, in its organization) as one data source. */
export async function allSource(ctx: Ctx, r: AllReader, projects: readonly Project[], writes: Promise<void>[]): Promise<McpDataSource> {
  const { db, telemetry, config } = ctx.app;
  const labels = projectLabels(projects);
  const scope = tenantScope(r.orgId, projects.map((p) => p.id), labels);
  let recent: Promise<Trace[]> | undefined;
  const tag = <T extends object>(p: Project) => (x: T) => ({ ...x, project: labels[p.id] });
  return {
    service: "all projects",
    version: ctx.app.version,
    ...(await scopeFacts(ctx.app, projects)),
    all: () => (recent ??= telemetry.traces({ scope, limit: MCP_RECENT })),
    get: (traceId) => telemetry.trace(scope, traceId),
    metrics: (range, params) => projectMetrics(telemetry, scope, range, params, { now: config.now() }),
    search: (q) => telemetry.search(scope, q),
    suggest: (s) => telemetry.suggest(scope, s),
    page: (page, range, params) => scopePage(ctx.app, { projects, scope }, page, range, params),
    alerts: async () => {
      const each = await Promise.all(projects.map(async (p) => ({ rules: (await listRules(db, p.id)).map(tag(p)), events: (await listEvents(db, p.id, ALERT_EVENTS)).map(tag(p)) })));
      return { rules: each.flatMap((e) => e.rules), events: each.flatMap((e) => e.events).sort((a, b) => b.timeMs - a.timeMs).slice(0, ALERT_EVENTS) };
    },
    now: () => config.now(),
    tags: () => scopeTags(ctx.app, projects),
    audit: (line) => void writes.push(audit(db, r.orgId, r.actor, "mcp.call", { line, projects: projects.length, ...(r.via ? { app: r.via } : {}) }, config.now())),
  };
}
