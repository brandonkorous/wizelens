// Project settings in the cloud: `api/projects/:project/settings`. Anyone who can read the project sees them; admins change them.
import { effectiveSettings, parseSettings } from "@wizeworks/lens-core/internal";
import type { Ctx } from "../app.js";
import { requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { cloudDefaults, projectSettingsOf, saveProjectSettings } from "../repo/settings.js";
import { forgetModels } from "./models.js";

async function current(ctx: Ctx, projectId: string) {
  const found = await projectSettingsOf(ctx.app.db, projectId);
  if (!found) return fail(404, "Project not found.");
  const defaults = cloudDefaults(ctx.app.config, found.orgDays);
  return { defaults, settings: found.settings, effective: effectiveSettings(defaults, found.settings) };
}

async function show(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  sendJson(ctx.res, 200, await current(ctx, project.id));
}

/** Replace the project's own settings. Thresholds and keys apply to new data; a shorter retention at the next prune. */
async function change(ctx: Ctx): Promise<void> {
  const { project, actor } = await requireProject(ctx, ctx.params.project!, "manage");
  const { defaults } = await current(ctx, project.id);
  let next;
  try {
    next = parseSettings(await readJsonBody(ctx.req), defaults.retentionDays);
  } catch (err) {
    return fail(400, err instanceof Error ? err.message : "Invalid settings.");
  }
  await saveProjectSettings(ctx.app.db, project.id, next);
  ctx.app.settings.drop(project.id);
  forgetModels(project.id);
  await audit(ctx.app.db, project.orgId, actor, "project.settings", { projectId: project.id, ...next }, ctx.app.config.now());
  sendJson(ctx.res, 200, await current(ctx, project.id));
}

export function settingsRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/projects/:project/settings", show).on("PUT", "api/projects/:project/settings", change);
}
