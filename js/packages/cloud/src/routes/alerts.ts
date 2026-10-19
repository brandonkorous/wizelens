import { type AlertChannel, MUTED_FOREVER, parseAlertRule } from "@wizeworks/lens-core";
import { checkTarget } from "@wizeworks/lens-hub/kit";
import { notify } from "../alerts/evaluate.js";
import type { Ctx } from "../app.js";
import { requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { addEvent, listEvents, ruleEvents, ruleValues } from "../repo/alert-events.js";
import { ackRule, createRule, deleteRule, listRules, muteRule, ruleById, type RuleInput, updateRule } from "../repo/alerts.js";
import { memberEmails } from "../repo/users.js";

const MAX_EMAILS = 20;

/** Who did it, in words: the person's name or email. Only people can mute and acknowledge. */
const whoOf = (a: { principal: { kind: string; user?: { name: string; email: string } } }): string => (a.principal.kind === "user" && a.principal.user ? a.principal.user.name || a.principal.user.email : "someone");
const DAY_MS = 86_400_000;

/** Email goes only to members of the organization with a confirmed address, so a rule cannot send mail to strangers. */
async function emailChannel(ctx: Ctx, orgId: string, to: unknown): Promise<AlertChannel | string> {
  const allowed = new Set(await memberEmails(ctx.app.db, orgId, ctx.app.mailer.live));
  const list = Array.isArray(to) ? [...new Set(to.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()))] : [];
  if (list.length === 0 || list.length > MAX_EMAILS) return `Send to 1 to ${MAX_EMAILS} email addresses.`;
  const stranger = list.find((e) => !allowed.has(e));
  return stranger ? `${stranger} is not a member of this organization with a confirmed email.` : { kind: "email", to: list };
}

/** Check a rule from the request body. A change sends only what it changes: the rest comes from `current`. */
async function ruleInput(ctx: Ctx, orgId: string, current?: object): Promise<RuleInput> {
  const b = { ...current, ...(await readJsonBody(ctx.req)) } as Record<string, unknown>;
  const allowPrivate = ctx.app.config.allowPrivateWebhooks;
  const r = await parseAlertRule(b, { checkUrl: (url) => checkTarget(url, allowPrivate), email: (to) => emailChannel(ctx, orgId, to) });
  return typeof r === "string" ? fail(400, r) : r;
}

async function list(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  sendJson(ctx.res, 200, { rules: await listRules(ctx.app.db, project.id), events: await listEvents(ctx.app.db, project.id, 100) });
}

/** One rule: its events and its values over `from`..`to` (default the last day). */
async function one(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  const rule = await ruleById(ctx.app.db, project.id, ctx.params.id!);
  if (!rule) return fail(404, "Alert rule not found.");
  const to = Number(ctx.url.searchParams.get("to")) || ctx.app.config.now() + 1;
  const from = Number(ctx.url.searchParams.get("from")) || to - DAY_MS;
  sendJson(ctx.res, 200, { rule, events: await ruleEvents(ctx.app.db, rule.id, 100), values: await ruleValues(ctx.app.db, rule.id, from, to) });
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

/** `{ untilMs }`: no notices until then (`null` unmutes, `-1` mutes until unmuted). */
async function mute(ctx: Ctx): Promise<void> {
  const access = await requireProject(ctx, ctx.params.project!, "write");
  const { project } = access;
  const actor = whoOf(access);
  const rule = await ruleById(ctx.app.db, project.id, ctx.params.id!);
  if (!rule) return fail(404, "Alert rule not found.");
  const raw = (await readJsonBody(ctx.req)).untilMs;
  const now = ctx.app.config.now();
  const untilMs = raw === null ? null : raw === -1 ? MUTED_FOREVER : Number(raw);
  if (untilMs !== null && (!Number.isFinite(untilMs) || untilMs <= now)) return fail(400, "Set untilMs to a future time, -1 for until unmuted, or null to unmute.");
  await muteRule(ctx.app.db, project.id, rule.id, untilMs);
  const message = untilMs === null ? `Unmuted by ${actor}` : untilMs === MUTED_FOREVER ? `Muted by ${actor} until unmuted` : `Muted by ${actor} until ${new Date(untilMs).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  await addEvent(ctx.app.db, rule, { kind: untilMs === null ? "unmute" : "mute", value: null, message, timeMs: now, delivery: "" });
  sendJson(ctx.res, 200, await ruleById(ctx.app.db, project.id, rule.id));
}

/** Acknowledge a firing rule: reminders stop until it resolves. */
async function ack(ctx: Ctx): Promise<void> {
  const access = await requireProject(ctx, ctx.params.project!, "write");
  const { project } = access;
  const actor = whoOf(access);
  const rule = await ruleById(ctx.app.db, project.id, ctx.params.id!);
  if (!rule) return fail(404, "Alert rule not found.");
  if (rule.state !== "firing") return fail(400, "Only a firing rule can be acknowledged.");
  const now = ctx.app.config.now();
  await ackRule(ctx.app.db, project.id, rule.id, now);
  await addEvent(ctx.app.db, rule, { kind: "ack", value: rule.lastValue, message: `Acknowledged by ${actor}`, timeMs: now, delivery: "" });
  sendJson(ctx.res, 200, await ruleById(ctx.app.db, project.id, rule.id));
}

export function alertRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/projects/:project/alerts", list)
    .on("POST", "api/projects/:project/alerts", create)
    .on("GET", "api/projects/:project/alerts/:id", one)
    .on("PATCH", "api/projects/:project/alerts/:id", change)
    .on("DELETE", "api/projects/:project/alerts/:id", remove)
    .on("POST", "api/projects/:project/alerts/:id/test", test)
    .on("POST", "api/projects/:project/alerts/:id/mute", mute)
    .on("POST", "api/projects/:project/alerts/:id/ack", ack);
}
