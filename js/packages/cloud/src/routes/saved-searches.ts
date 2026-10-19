import { parseSavedSearch, type SavedSearch } from "@wizeworks/lens-core";
import type { Ctx } from "../app.js";
import { newId } from "../auth/crypto.js";
import { requireProject } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";

// Saved searches: per project, shared with everyone who can read it. Log searches become charts on the Logs page.
interface Row {
  id: string;
  name: string;
  params: string;
  created_by: string;
  created_ms: number;
}

const searchOf = (r: Row): SavedSearch => ({ id: r.id, kind: "logs", name: r.name, params: JSON.parse(r.params) as Record<string, string>, createdMs: Number(r.created_ms), createdBy: r.created_by });

async function list(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!);
  const kind = ctx.url.searchParams.get("kind") || "logs";
  const rows = await ctx.app.db.query<Row>("SELECT id, name, params, created_by, created_ms FROM saved_searches WHERE project_id = $1 AND kind = $2 ORDER BY created_ms, id", [project.id, kind]);
  sendJson(ctx.res, 200, { searches: rows.map(searchOf) });
}

async function create(ctx: Ctx): Promise<void> {
  const { project, actor } = await requireProject(ctx, ctx.params.project!, "write");
  const parsed = parseSavedSearch(await readJsonBody(ctx.req));
  if (typeof parsed === "string") return fail(400, parsed);
  const search: SavedSearch = { id: newId(), ...parsed, createdMs: ctx.app.config.now(), createdBy: actor };
  await ctx.app.db.query("INSERT INTO saved_searches (id, project_id, kind, name, params, created_by, created_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    search.id, project.id, search.kind, search.name, JSON.stringify(search.params), actor, search.createdMs,
  ]);
  sendJson(ctx.res, 201, { search });
}

async function remove(ctx: Ctx): Promise<void> {
  const { project } = await requireProject(ctx, ctx.params.project!, "write");
  const gone = await ctx.app.db.query<{ id: string }>("DELETE FROM saved_searches WHERE project_id = $1 AND id = $2 RETURNING id", [project.id, ctx.params.id!]);
  if (!gone.length) return fail(404, "Search not found.");
  sendJson(ctx.res, 200, { ok: true });
}

export function savedSearchRoutes(r: Router<Ctx>): void {
  r.on("GET", "api/projects/:project/saved-searches", list)
    .on("POST", "api/projects/:project/saved-searches", create)
    .on("DELETE", "api/projects/:project/saved-searches/:id", remove);
}
