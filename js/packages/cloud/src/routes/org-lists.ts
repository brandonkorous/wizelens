// Lists across an organization ("All projects"), each row with its project; creating and changing stay on that project's routes.
import { type IssueState, labelKey, sloReport, uptimeList } from "@wizeworks/lens-core/internal";
import type { Ctx } from "../app.js";
import { type OrgAccess, requireOrgRead } from "../auth/org-access.js";
import { sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { countEvents, listEvents } from "../repo/alert-events.js";
import { listRules } from "../repo/alerts.js";
import { assignableMembers, listIssues } from "../repo/issues.js";
import type { Project } from "../repo/projects.js";
import { listSlos } from "../repo/slos.js";
import { listChecks, listIncidents } from "../repo/uptime.js";
import { projectRetentionMs } from "../scale-exec.js";
import { projectScope } from "../telemetry/store.js";
import { eventPage } from "./alerts.js";
import { projectLabels } from "./scope.js";
import { liveShares } from "./shares.js";

const LIST = 100;

type Tagged<T> = T & { projectId: string; project: string };

/** Rows of every readable project, each with its project's id and label. */
async function each<T extends object>(a: OrgAccess, rows: (p: Project, label: string) => Promise<readonly T[]>): Promise<Tagged<T>[]> {
  const labels = projectLabels(a.projects);
  const lists = await Promise.all(a.projects.map(async (p) => (await rows(p, labels[p.id]!)).map((r) => ({ ...r, projectId: p.id, project: labels[p.id]! }))));
  return lists.flat();
}

const newest = <T>(rows: T[], at: (r: T) => number) => rows.sort((x, y) => at(y) - at(x)).slice(0, LIST);
const access = (ctx: Ctx) => requireOrgRead(ctx, ctx.params.org!);

async function alerts(ctx: Ctx): Promise<void> {
  const a = await access(ctx);
  const db = ctx.app.db;
  // A page across projects: each project's newest rows up to the page's end, merged, then cut to the page.
  const { size, offset } = eventPage(ctx.url);
  const [rules, events, counts] = await Promise.all([each(a, (p) => listRules(db, p.id)), each(a, (p) => listEvents(db, p.id, offset + size)), Promise.all(a.projects.map((p) => countEvents(db, { project: p.id })))]);
  const page = events.sort((x, y) => y.timeMs - x.timeMs).slice(offset, offset + size);
  sendJson(ctx.res, 200, { rules, events: page, eventCount: counts.reduce((t, n) => t + n, 0) });
}

/** Issue keys of error groups name their service with the project's label, as the error pages show them. */
async function issues(ctx: Ctx): Promise<void> {
  const a = await access(ctx);
  const many = a.projects.length > 1;
  const shown = (s: IssueState, label: string): IssueState => (many && s.kind === "error" ? { ...s, key: labelKey("err.g", s.key, label) } : s);
  const list = await each(a, async (p, label) => (await listIssues(ctx.app.db, p.id)).map((s) => shown(s, label)));
  sendJson(ctx.res, 200, { issues: list, members: await assignableMembers(ctx.app.db, a.orgId) });
}

async function slos(ctx: Ctx): Promise<void> {
  const a = await access(ctx);
  const { db, config, telemetry } = ctx.app;
  const list = await each(a, async (p) => {
    const ex = telemetry.executor(projectScope(p), await projectRetentionMs(db, p.id, config.retentionDays));
    return Promise.all((await listSlos(db, p.id)).map((s) => sloReport(s, ex, config.now())));
  });
  sendJson(ctx.res, 200, { slos: list, apdex: {} });
}

async function uptime(ctx: Ctx): Promise<void> {
  const a = await access(ctx);
  const now = ctx.app.config.now();
  const views = await Promise.all(a.projects.map(async (p) => uptimeList(await listChecks(ctx.app.db, ctx.app.secrets, p.id), await listIncidents(ctx.app.db, p.id, now), now)));
  const labels = projectLabels(a.projects);
  const tag = <T extends object>(rows: readonly T[], i: number) => rows.map((r) => ({ ...r, projectId: a.projects[i]!.id, project: labels[a.projects[i]!.id]! }));
  const checks = views.flatMap((v, i) => tag(v.checks, i));
  const incidents = newest(views.flatMap((v, i) => tag(v.incidents, i)), (x) => x.startMs);
  sendJson(ctx.res, 200, { checks, incidents, nowMs: now });
}

async function shares(ctx: Ctx): Promise<void> {
  const a = await access(ctx);
  const rows = await each(a, (p) => liveShares(ctx.app.db, p.id, ctx.app.config.now()));
  sendJson(ctx.res, 200, rows.sort((x, y) => y.createdMs - x.createdMs));
}

export function orgListRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/orgs/:org/alerts", alerts)
    .on("GET", "api/orgs/:org/issues", issues)
    .on("GET", "api/orgs/:org/slos", slos)
    .on("GET", "api/orgs/:org/uptime", uptime)
    .on("GET", "api/orgs/:org/shares", shares);
}
