// Alerts across many projects: one rule made in each picked project, and mute, unmute, on, off, or delete for many rules.
import { MUTED_FOREVER } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { requireOrg, requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import { idsOf } from "../http/ids.js";
import type { Router } from "../http/router.js";
import { addEvent } from "../repo/alert-events.js";
import { createRule, deleteRule, muteRule, ruleById, setRuleEnabled } from "../repo/alerts.js";
import { checkRule, muteMessage, whoOf } from "./alerts.js";

const ACTIONS = ["mute", "unmute", "enable", "disable", "delete"] as const;
type Action = (typeof ACTIONS)[number];

/** `POST api/orgs/:org/alerts/copy`: `{ rule, projectIds }`. The same rule is made in every project, all or none. */
async function copy(ctx: Ctx): Promise<void> {
  const org = ctx.params.org!;
  await requireOrg(ctx, org, "read");
  const body = await readJsonBody(ctx.req);
  const ids = idsOf(body.projectIds, "projects");
  const rule = (body.rule ?? {}) as Record<string, unknown>;
  if (rule.metric === "slo" && ids.length > 1) fail(400, "An SLO alert belongs to the SLO's own project. Make it there.");
  const access: Awaited<ReturnType<typeof requireProject>>[] = [];
  for (const id of ids) access.push(await requireProject(ctx, id, "write"));
  if (access.some((a) => a.project.orgId !== org)) fail(404, "Project not found.");
  const input = await checkRule(ctx, org, ids[0]!, rule);
  const now = ctx.app.config.now();
  const created = await ctx.app.db.tx(async (q) => {
    const out = [];
    for (const a of access) out.push({ projectId: a.project.id, id: await createRule(q, a.project.id, input, a.actor, now) });
    return out;
  });
  sendJson(ctx.res, 201, { created });
}

function untilOf(action: Action, raw: unknown, now: number): number | null {
  if (action !== "mute") return null;
  const untilMs = raw === -1 ? MUTED_FOREVER : Number(raw);
  if (!Number.isFinite(untilMs) || untilMs <= now) fail(400, "Set untilMs to a future time, or -1 for until unmuted.");
  return untilMs;
}

/** `POST api/orgs/:org/alerts/bulk`: `{ action, rules: [{ projectId, id }], untilMs? }`. Rules that are gone come back as `missing`. */
async function bulk(ctx: Ctx): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const action = body.action as Action;
  if (!ACTIONS.includes(action)) fail(400, `Set action to ${ACTIONS.join(", ")}.`);
  const rules = Array.isArray(body.rules) ? (body.rules as { projectId?: unknown; id?: unknown }[]) : [];
  const ids = idsOf(rules.map((r) => r?.id), "rules");
  const now = ctx.app.config.now();
  const untilMs = untilOf(action, body.untilMs, now);
  const missing: string[] = [];
  let changed = 0;
  for (const projectId of new Set(rules.map((r) => String(r.projectId)))) {
    const access = await requireProject(ctx, projectId, "write");
    if (access.project.orgId !== ctx.params.org) fail(404, "Project not found.");
    for (const r of rules.filter((x) => x.projectId === projectId && ids.includes(String(x.id)))) {
      const rule = await ruleById(ctx.app.db, projectId, String(r.id));
      if (!rule) {
        missing.push(String(r.id));
        continue;
      }
      await applyOne(ctx, action, rule, untilMs, whoOf(access), now);
      changed++;
    }
  }
  sendJson(ctx.res, 200, { changed, missing });
}

async function applyOne(ctx: Ctx, action: Action, rule: NonNullable<Awaited<ReturnType<typeof ruleById>>>, untilMs: number | null, actor: string, now: number): Promise<void> {
  const db = ctx.app.db;
  if (action === "delete") return void (await deleteRule(db, rule.projectId, rule.id));
  if (action === "enable" || action === "disable") return setRuleEnabled(db, rule.projectId, rule.id, action === "enable");
  await muteRule(db, rule.projectId, rule.id, untilMs);
  await addEvent(db, rule, { kind: action === "mute" ? "mute" : "unmute", value: null, message: muteMessage(actor, untilMs), timeMs: now, delivery: "" });
}

export function alertBulkRoutes(r: Router<Ctx>): void {
  r.on("POST", "api/orgs/:org/alerts/copy", copy).on("POST", "api/orgs/:org/alerts/bulk", bulk);
}

