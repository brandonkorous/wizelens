// Saved items under "All projects": the list holds the organization's own and those of every project the caller may read; only the organization's own change here.
import { parseSaved, type SavedItem } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { requireOrgRead } from "../auth/org-access.js";
import { requireOrg } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { createOrgSaved, deleteSaved, listOrgSaved, orgSavedById, updateSaved } from "../repo/saved.js";
import { projectLabels } from "./scope.js";

async function list(ctx: Ctx): Promise<void> {
  const a = await requireOrgRead(ctx, ctx.params.org!);
  const labels = projectLabels(a.projects);
  const userId = a.principal.kind === "user" ? a.principal.user.id : null;
  const items = await listOrgSaved(ctx.app.db, a.orgId, a.projects.map((p) => p.id), userId);
  sendJson(ctx.res, 200, { items: items.map((i) => (i.projectId ? { ...i, project: labels[i.projectId] } : i)) });
}

/** An organization item the person may see: their own, or a shared one. */
async function visible(ctx: Ctx, userId: string): Promise<SavedItem> {
  const item = await orgSavedById(ctx.app.db, ctx.params.org!, ctx.params.id!);
  if (!item || (!item.shared && item.owner !== userId)) return fail(404, "Not found.");
  return item;
}

async function create(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "write");
  const input = parseSaved(await readJsonBody(ctx.req));
  if (typeof input === "string") return fail(400, input);
  const id = await createOrgSaved(ctx.app.db, ctx.params.org!, user.id, input, ctx.app.config.now());
  sendJson(ctx.res, 201, await orgSavedById(ctx.app.db, ctx.params.org!, id));
}

async function one(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "read");
  sendJson(ctx.res, 200, await visible(ctx, user.id));
}

/** Only the owner changes an item. */
async function change(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "write");
  const item = await visible(ctx, user.id);
  if (item.owner !== user.id) return fail(403, "Only the person who saved it can change it.");
  const input = parseSaved({ ...item, ...(await readJsonBody(ctx.req)), kind: item.kind });
  if (typeof input === "string") return fail(400, input);
  await updateSaved(ctx.app.db, item.id, input, ctx.app.config.now());
  sendJson(ctx.res, 200, await orgSavedById(ctx.app.db, ctx.params.org!, item.id));
}

/** The owner deletes an item; admins and owners of the organization may delete shared ones too. */
async function remove(ctx: Ctx): Promise<void> {
  const { user, role } = await requireOrg(ctx, ctx.params.org!, "write");
  const item = await visible(ctx, user.id);
  if (item.owner !== user.id && role !== "admin" && role !== "owner") return fail(403, "Only the person who saved it, or an admin, can delete it.");
  await deleteSaved(ctx.app.db, item.id);
  sendJson(ctx.res, 200, { ok: true });
}

export function orgSavedRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/orgs/:org/saved", list)
    .on("POST", "api/orgs/:org/saved", create)
    .on("GET", "api/orgs/:org/saved/:id", one)
    .on("PATCH", "api/orgs/:org/saved/:id", change)
    .on("DELETE", "api/orgs/:org/saved/:id", remove);
}
