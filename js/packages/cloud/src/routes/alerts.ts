import { DEFAULT_SPREADS, isAlertMetric, isAlertOp, isAnomalyMetric, isMetricAlertStat, MAX_METRIC_NAME } from "@wizeworks/lens-core";
import { notify } from "../alerts/evaluate.js";
import { checkTarget } from "../alerts/notify.js";
import type { Ctx } from "../app.js";
import { requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson, str } from "../http/http.js";
import type { Router } from "../http/router.js";
import { memberEmails } from "../repo/users.js";
import { type Channel, createRule, deleteRule, listEvents, listRules, ruleById, type RuleInput, updateRule } from "../repo/alerts.js";

const WINDOWS = [5, 15, 60, 360, 1440].map((m) => m * 60_000);
const MAX_CHANNELS = 5;
const MAX_EMAILS = 20;

/** Email goes only to members of the organization with a confirmed address, so a rule cannot send mail to strangers. */
async function emailChannel(ctx: Ctx, orgId: string, to: unknown): Promise<Channel> {
  const allowed = new Set(await memberEmails(ctx.app.db, orgId, ctx.app.mailer.live));
  const list = Array.isArray(to) ? [...new Set(to.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()))] : [];
  if (list.length === 0 || list.length > MAX_EMAILS) fail(400, `Send to 1 to ${MAX_EMAILS} email addresses.`);
  const stranger = list.find((e) => !allowed.has(e));
  if (stranger) fail(400, `${stranger} is not a member of this organization with a confirmed email.`);
  return { kind: "email", to: list };
}

async function channelsOf(ctx: Ctx, orgId: string, raw: unknown): Promise<Channel[]> {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_CHANNELS) : [];
  const out: Channel[] = [];
  for (const c of list as { kind?: unknown; url?: unknown; to?: unknown }[]) {
    if (c.kind === "email") {
      out.push(await emailChannel(ctx, orgId, c.to));
      continue;
    }
    if ((c.kind !== "webhook" && c.kind !== "slack") || typeof c.url !== "string") return fail(400, "Each channel needs kind (webhook, slack, or email) and url (or to).");
    const problem = await checkTarget(c.url, ctx.app.config.allowPrivateWebhooks);
    if (problem) fail(400, `${c.url}: ${problem}`);
    out.push({ kind: c.kind, url: c.url });
  }
  return out;
}

/** The metric part of a rule: for "metric" rules, the OpenTelemetry metric to read. */
function metricPart(b: Record<string, unknown>): Pick<RuleInput, "metric" | "metricName" | "metricStat" | "metricService"> {
  if (b.metric !== "metric") {
    if (!isAlertMetric(b.metric)) fail(400, "Pick a metric: error_rate, p95_ms, avg_ms, requests, new_errors, slow_queries, or metric.");
    return { metric: b.metric as RuleInput["metric"], metricName: "", metricStat: "", metricService: "" };
  }
  const name = typeof b.metricName === "string" ? b.metricName.trim() : "";
  if (!name || name.length > MAX_METRIC_NAME) fail(400, "Set metricName to the metric to watch, for example process.cpu.utilization.");
  const stat = b.metricStat ?? "avg";
  if (!isMetricAlertStat(stat)) fail(400, "Pick a metricStat: last, avg, max, p95, p99, or rate.");
  const service = typeof b.metricService === "string" ? b.metricService.trim().slice(0, 100) : "";
  return { metric: "metric", metricName: name, metricStat: stat as RuleInput["metricStat"], metricService: service };
}

/** "Above normal" works on the metrics with a baseline; its threshold is how many spreads above normal (2 high, 3 medium, 4 low). */
function checkAboveNormal(metric: RuleInput["metric"], spreads: number): void {
  if (!isAnomalyMetric(metric)) fail(400, "Above normal works with error_rate, p95_ms, or requests.");
  if (spreads < 1 || spreads > 10) fail(400, "For above normal, set threshold to the sensitivity: 2 (high), 3 (medium), or 4 (low), or any number from 1 to 10.");
}

/** Check a rule from the request body. A change sends only what it changes: the rest comes from `current`. */
async function ruleInput(ctx: Ctx, orgId: string, current?: object): Promise<RuleInput> {
  const b = { ...current, ...(await readJsonBody(ctx.req)) } as Record<string, unknown>;
  const metric = metricPart(b);
  if (!isAlertOp(b.op)) fail(400, 'Set op to ">", "<", or "above_normal".');
  const threshold = Number(b.threshold ?? (b.op === "above_normal" ? DEFAULT_SPREADS : undefined));
  if (!Number.isFinite(threshold)) fail(400, "Set a number for threshold.");
  if (b.op === "above_normal") checkAboveNormal(metric.metric, threshold);
  const windowMs = Number(b.windowMs ?? 5 * 60_000);
  if (!WINDOWS.includes(windowMs)) fail(400, "Pick a window of 5, 15, 60, 360, or 1440 minutes.");
  return {
    name: str(b, "name").slice(0, 100),
    ...metric,
    op: b.op as RuleInput["op"],
    threshold,
    windowMs,
    env: typeof b.env === "string" ? b.env.slice(0, 50) : "",
    channels: await channelsOf(ctx, orgId, b.channels),
    enabled: b.enabled !== false,
  };
}

async function list(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  sendJson(ctx.res, 200, { rules: await listRules(ctx.app.db, project.id), events: await listEvents(ctx.app.db, project.id, 100) });
}

async function create(ctx: Ctx): Promise<void> {
  const { project, actor } = await requireProject(ctx, ctx.params.project!, "write");
  const id = await createRule(ctx.app.db, project.id, await ruleInput(ctx, project.orgId), actor, ctx.app.config.now());
  sendJson(ctx.res, 201, await ruleById(ctx.app.db, project.id, id));
}

async function change(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!, "write");
  const current = await ruleById(ctx.app.db, project.id, ctx.params.id!);
  if (!current) fail(404, "Alert rule not found.");
  await updateRule(ctx.app.db, project.id, ctx.params.id!, await ruleInput(ctx, project.orgId, current));
  sendJson(ctx.res, 200, await ruleById(ctx.app.db, project.id, ctx.params.id!));
}

async function remove(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!, "write");
  if (!(await deleteRule(ctx.app.db, project.id, ctx.params.id!))) fail(404, "Alert rule not found.");
  sendJson(ctx.res, 200, { ok: true });
}

/** Send a test notice through the rule's channels now. */
async function test(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!, "write");
  const rule = await ruleById(ctx.app.db, project.id, ctx.params.id!);
  if (!rule) return fail(404, "Alert rule not found.");
  sendJson(ctx.res, 200, { delivery: await notify(ctx.app, rule, "test", rule.lastValue, ctx.app.config.now()) });
}

export function alertRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/projects/:project/alerts", list)
    .on("POST", "api/projects/:project/alerts", create)
    .on("PATCH", "api/projects/:project/alerts/:id", change)
    .on("DELETE", "api/projects/:project/alerts/:id", remove)
    .on("POST", "api/projects/:project/alerts/:id/test", test);
}
