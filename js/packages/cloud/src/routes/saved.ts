import { parseSaved, type SavedItem } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { type ProjectAccess, requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { createSaved, deleteSaved, listSaved, savedById, updateSaved } from "../repo/saved.js";

const userOf = (a: ProjectAccess): string | null => (a.principal.kind === "user" ? a.principal.user.id : null);

/** An item the viewer may see: their own, or a shared one. */
async function visible(ctx: Ctx, a: ProjectAccess): Promise<SavedItem> {
  const item = await savedById(ctx.app.db, a.project.id, ctx.params.id!);
  if (!item || (!item.shared && item.owner !== userOf(a))) return fail(404, "Not found.");
  return item;
}

async function list(ctx: Ctx): Promise<void> {
  const a = await requireProject(ctx, ctx.params.project!);
  sendJson(ctx.res, 200, { items: await listSaved(ctx.app.db, a.project.id, userOf(a)) });
}

async function create(ctx: Ctx): Promise<void> {
  const a = await requireProject(ctx, ctx.params.project!, "write");
  const input = parseSaved(await readJsonBody(ctx.req));
  if (typeof input === "string") return fail(400, input);
  const id = await createSaved(ctx.app.db, a.project.id, userOf(a)!, input, ctx.app.config.now());
  sendJson(ctx.res, 201, await savedById(ctx.app.db, a.project.id, id));
}

async function one(ctx: Ctx): Promise<void> {
  sendJson(ctx.res, 200, await visible(ctx, await requireProject(ctx, ctx.params.project!)));
}

/** Only the owner changes an item. */
async function change(ctx: Ctx): Promise<void> {
  const a = await requireProject(ctx, ctx.params.project!, "write");
  const item = await visible(ctx, a);
  if (item.owner !== userOf(a)) return fail(403, "Only the person who saved it can change it.");
  const input = parseSaved({ ...item, ...(await readJsonBody(ctx.req)), kind: item.kind });
  if (typeof input === "string") return fail(400, input);
  await updateSaved(ctx.app.db, item.id, input, ctx.app.config.now());
  sendJson(ctx.res, 200, await savedById(ctx.app.db, a.project.id, item.id));
}

/** The owner deletes an item; admins and owners of the organization may delete shared ones too. */
async function remove(ctx: Ctx): Promise<void> {
  const a = await requireProject(ctx, ctx.params.project!, "write");
  const item = await visible(ctx, a);
  if (item.owner !== userOf(a) && a.role !== "admin" && a.role !== "owner") return fail(403, "Only the person who saved it, or an admin, can delete it.");
  await deleteSaved(ctx.app.db, item.id);
  sendJson(ctx.res, 200, { ok: true });
}

export function savedRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/projects/:project/saved", list)
    .on("POST", "api/projects/:project/saved", create)
    .on("GET", "api/projects/:project/saved/:id", one)
    .on("PATCH", "api/projects/:project/saved/:id", change)
    .on("DELETE", "api/projects/:project/saved/:id", remove);
}
