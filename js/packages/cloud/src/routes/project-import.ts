// Onboarding at scale: many projects in one request, each with a new sending key whose secret is answered once.
import { checkProjectList, type ImportProblem, MAX_IMPORT_REQUEST } from "@wizeworks/lens-core/internal";
import type { Ctx } from "../app.js";
import { requireOrg } from "../auth/principal.js";
import { fail, HttpError, readJsonBody, sendJson } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { originsFor } from "../repo/key-origins.js";
import { type ImportRow, importProjects } from "../repo/project-import.js";
import { daysOf } from "./keys.js";

const DAY_MS = 86_400_000;
const SHOWN = 5;

/** A 400 naming the first few bad rows; every one is in `problems`. */
function refuse(problems: ImportProblem[]): never {
  const text = problems.slice(0, SHOWN).map((p) => (p.row ? `Row ${p.row}: ${p.message}` : p.message));
  const more = problems.length > SHOWN ? ` And ${problems.length - SHOWN} more.` : "";
  throw new HttpError(400, `Nothing was made. ${text.join(" ")}${more}`, { problems });
}

/** Checked rows, with each browser key's sites normalized the way a single key's are. */
function rowsOf(list: unknown): ImportRow[] {
  if (!Array.isArray(list) || list.length === 0) fail(400, "Send projects: a list of names, or of { name, kind, sites, keyName }.");
  const items = list as unknown[];
  if (items.length > MAX_IMPORT_REQUEST) fail(400, `Send up to ${MAX_IMPORT_REQUEST} projects in one request.`);
  const { rows, problems } = checkProjectList(items);
  const out = rows.map((r): ImportRow | ImportProblem => {
    if (r.kind !== "browser") return { name: r.name, kind: r.kind, keyName: r.keyName, origins: null };
    try {
      return { name: r.name, kind: r.kind, keyName: r.keyName, origins: originsFor(r.sites) };
    } catch (err) {
      return { row: r.row, message: err instanceof Error ? err.message : "Invalid sites." };
    }
  });
  const bad = [...problems, ...out.filter((r): r is ImportProblem => "message" in r)];
  if (bad.length) refuse(bad.sort((a, b) => a.row - b.row));
  return out as ImportRow[];
}

/** `POST api/orgs/:org/projects/import`: `{ projects, expiresInDays? }`. A name already in the organization gets a new key, not a second project. */
async function importMany(ctx: Ctx): Promise<void> {
  const org = ctx.params.org!;
  const { user } = await requireOrg(ctx, org, "manage");
  const body = await readJsonBody(ctx.req);
  const rows = rowsOf(body.projects);
  const days = daysOf(body.expiresInDays);
  const now = ctx.app.config.now();
  const expiresMs = days === null ? null : now + days * DAY_MS;
  const keys = await ctx.app.db.tx((q) => importProjects(q, org, rows, user.id, now, expiresMs));
  const made = keys.filter((k) => k.newProject);
  const detail = { projects: made.length, keys: keys.length, projectIds: made.map((k) => k.projectId), keyIds: keys.map((k) => k.keyId), expiresMs };
  await audit(ctx.app.db, org, `user:${user.id}`, "project.import", detail, now);
  sendJson(ctx.res, 201, { keys, expiresMs });
}

export function projectImportRoutes(r: Router<Ctx>): void {
  r.on("POST", "api/orgs/:org/projects/import", importMany);
}
