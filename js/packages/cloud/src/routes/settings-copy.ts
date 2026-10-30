// One project's settings copied to many: thresholds and hidden keys, and if asked, how long traces and logs are kept.
import type { ProjectSettings } from "@wizeworks/lens-core/internal";
import type { Ctx } from "../app.js";
import { requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import { idsOf } from "../http/ids.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { projectSettingsOf, saveProjectSettings } from "../repo/settings.js";
import { forgetModels } from "./models.js";

const PARTS = ["checks", "retention"] as const;
type Part = (typeof PARTS)[number];

/** The target's settings with the source's picked parts; a part the source leaves to the host is left to the host here too. */
function merged(target: ProjectSettings, source: ProjectSettings, parts: Part[]): ProjectSettings {
  const next: ProjectSettings = { ...target };
  const keys: (keyof ProjectSettings)[] = [...(parts.includes("checks") ? (["slowQueryMs", "nPlusOneThreshold", "redactKeys"] as const) : []), ...(parts.includes("retention") ? (["retentionDays"] as const) : [])];
  for (const k of keys) {
    if (source[k] === undefined) delete next[k];
    else Object.assign(next, { [k]: source[k] });
  }
  return next;
}

/** `POST api/orgs/:org/settings/copy`: `{ from, projectIds, parts: ["checks", "retention"] }`. Owners and admins of every target only; all or none. */
async function copy(ctx: Ctx): Promise<void> {
  const body = await readJsonBody(ctx.req);
  const parts = Array.isArray(body.parts) ? PARTS.filter((p) => (body.parts as unknown[]).includes(p)) : [];
  if (parts.length === 0) fail(400, 'Set parts to "checks", "retention", or both.');
  const source = await requireProject(ctx, String(body.from ?? ""), "read");
  if (source.project.orgId !== ctx.params.org) fail(404, "Project not found.");
  const ids = idsOf(body.projectIds, "projects").filter((id) => id !== source.project.id);
  const targets: Awaited<ReturnType<typeof requireProject>>[] = [];
  for (const id of ids) targets.push(await requireProject(ctx, id, "manage"));
  if (targets.some((t) => t.project.orgId !== ctx.params.org)) fail(404, "Project not found.");
  const from = (await projectSettingsOf(ctx.app.db, source.project.id))!.settings;
  await ctx.app.db.tx(async (q) => {
    for (const t of targets) {
      await saveProjectSettings(q, t.project.id, merged((await projectSettingsOf(q, t.project.id))!.settings, from, parts));
      if (parts.includes("retention")) await q.query("UPDATE projects SET log_retention_days = $1 WHERE id = $2", [source.project.logRetentionDays, t.project.id]);
    }
  });
  for (const t of targets) {
    ctx.app.settings.drop(t.project.id);
    forgetModels(t.project.id);
  }
  await audit(ctx.app.db, source.project.orgId, source.actor, "project.settings_copy", { from: source.project.id, name: source.project.name, projectIds: ids, parts }, ctx.app.config.now());
  sendJson(ctx.res, 200, { copied: ids.length });
}

export function settingsCopyRoutes(r: Router<Ctx>): void {
  r.on("POST", "api/orgs/:org/settings/copy", copy);
}
