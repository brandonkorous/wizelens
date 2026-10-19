import { activeTags, BUILT_IN_PREFIX, checkTagInput, matchTags, type SearchQuery, TAG_LIMITS, type TagRule, tagMatchRequestOf } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { type ProjectAccess, requireProject } from "../auth/principal.js";
import { can } from "../auth/roles.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { createTag, deleteTag, projectTags, setBuiltIn, updateTag } from "../repo/tags.js";

// Tag rules for one project (docs/TAGS-PLAN.md): anyone who reads the project reads them; the `tag` permission changes them.

function projectId(ctx: Ctx): string {
  const id = ctx.url.searchParams.get("project");
  return id || fail(400, "Add ?project=<project id>.");
}

const changer = (ctx: Ctx): Promise<ProjectAccess> => requireProject(ctx, projectId(ctx), "tag");

async function note(ctx: Ctx, a: ProjectAccess, action: string, tag: Pick<TagRule, "id" | "name">): Promise<void> {
  await audit(ctx.app.db, a.project.orgId, a.actor, action, { projectId: a.project.id, tagId: tag.id, name: tag.name }, ctx.app.config.now());
}

async function list(ctx: Ctx): Promise<void> {
  const a = await requireProject(ctx, projectId(ctx));
  const editable = a.principal.kind === "user" && can(a.role, "tag");
  sendJson(ctx.res, 200, { tags: await projectTags(ctx.app.db, a.project.id), editable, max: TAG_LIMITS.rules });
}

async function create(ctx: Ctx): Promise<void> {
  const a = await changer(ctx);
  const own = (await projectTags(ctx.app.db, a.project.id)).filter((t) => !t.builtIn);
  if (own.length >= TAG_LIMITS.rules) fail(400, `A project holds up to ${TAG_LIMITS.rules} tags. Delete one first.`);
  const r = checkTagInput(await readJsonBody(ctx.req), own.map((t) => t.name));
  if (!r.ok) return sendJson(ctx.res, 400, r);
  const tag = await createTag(ctx.app.db, a.project.id, r.input, a.actor, ctx.app.config.now());
  await note(ctx, a, "tag.create", tag);
  sendJson(ctx.res, 201, tag);
}

async function toggleBuiltIn(ctx: Ctx, a: ProjectAccess, id: string, enabled: unknown): Promise<void> {
  if (typeof enabled !== "boolean") fail(400, "A built-in tag can only be turned on or off: send { enabled }.");
  if (!(await setBuiltIn(ctx.app.db, a.project.id, id, enabled as boolean))) fail(404, "Tag not found.");
  await note(ctx, a, enabled ? "tag.enable" : "tag.disable", { id, name: id.slice(BUILT_IN_PREFIX.length) });
  sendJson(ctx.res, 200, (await projectTags(ctx.app.db, a.project.id)).find((t) => t.id === id));
}

/** A rule takes name, color, and query (what is left out stays); a built-in takes only `enabled`. */
async function change(ctx: Ctx): Promise<void> {
  const a = await changer(ctx);
  const id = ctx.params.id!;
  const body = (await readJsonBody(ctx.req)) as Record<string, unknown>;
  if (id.startsWith(BUILT_IN_PREFIX)) return toggleBuiltIn(ctx, a, id, body.enabled);
  const tags = await projectTags(ctx.app.db, a.project.id);
  const current = tags.find((t) => t.id === id && !t.builtIn) ?? fail(404, "Tag not found.");
  const r = checkTagInput({ ...current, ...body }, tags.filter((t) => !t.builtIn && t.id !== id).map((t) => t.name));
  if (!r.ok) return sendJson(ctx.res, 400, r);
  await updateTag(ctx.app.db, a.project.id, id, r.input, ctx.app.config.now());
  await note(ctx, a, "tag.update", { id, name: r.input.name });
  sendJson(ctx.res, 200, { ...current, ...r.input });
}

async function remove(ctx: Ctx): Promise<void> {
  const a = await changer(ctx);
  const tag = (await projectTags(ctx.app.db, a.project.id)).find((t) => t.id === ctx.params.id && !t.builtIn) ?? fail(404, "Tag not found.");
  await deleteTag(ctx.app.db, a.project.id, tag.id);
  await note(ctx, a, "tag.delete", tag);
  sendJson(ctx.res, 200, { ok: true });
}

/** `POST api/tags/match?project=&env=` with `{ kind, items }`: each enabled rule runs on the project's search engine. */
async function match(ctx: Ctx): Promise<void> {
  const a = await requireProject(ctx, projectId(ctx));
  const r = tagMatchRequestOf(await readJsonBody(ctx.req));
  if (!r.ok) return sendJson(ctx.res, 400, r);
  const tags = activeTags(await projectTags(ctx.app.db, a.project.id));
  const run = (q: SearchQuery) => ctx.app.telemetry.search(a.project.id, q);
  sendJson(ctx.res, 200, { matches: await matchTags(run, r.kind, r.items, tags, ctx.url.searchParams.get("env") || undefined) });
}

export function tagRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/tags", list)
    .on("POST", "api/tags", create)
    .on("POST", "api/tags/match", match)
    .on("PATCH", "api/tags/:id", change)
    .on("DELETE", "api/tags/:id", remove);
}
