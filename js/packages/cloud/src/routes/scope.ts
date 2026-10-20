// Which projects a data route reads: `?project=<id>` for one, `?project=all&org=<id>` for every project the caller may read there.
import type { CloudApp, Ctx } from "../app.js";
import { requireOrgRead } from "../auth/org-access.js";
import { type ProjectAccess, requireProject } from "../auth/principal.js";
import { fail } from "../http/http.js";
import type { Project } from "../repo/projects.js";
import { factsWith } from "../repo/settings.js";
import { projectRetentionMs } from "../scale-exec.js";
import { projectScope, type TenantScope, tenantScope } from "../telemetry/store.js";

/** The `project` value that asks for every project of `org`. */
export const ALL_PROJECTS = "all";

export interface ReadScope {
  orgId: string;
  /** Every project read, by name. */
  projects: Project[];
  /** The one project asked for; null for all of the organization. */
  project: Project | null;
  /** One project's access check (actor, role); null for all. */
  access: ProjectAccess | null;
  scope: TenantScope;
}

/** A project as reads name it: its id, and its name and slug for labels. */
export type ProjectRef = Pick<Project, "id"> & Partial<Pick<Project, "name" | "slug">>;

/** Each project's label: its name, with its slug when two share a name. */
export function projectLabels(projects: readonly ProjectRef[]): Record<string, string> {
  const nameOf = (p: ProjectRef) => p.name ?? p.id;
  const named = new Map<string, number>();
  for (const p of projects) named.set(nameOf(p), (named.get(nameOf(p)) ?? 0) + 1);
  return Object.fromEntries(projects.map((p) => [p.id, named.get(nameOf(p))! > 1 ? `${nameOf(p)} (${p.slug ?? p.id})` : nameOf(p)]));
}

/** The scope of a data route, with access checked. */
export async function readScopeOf(ctx: Ctx): Promise<ReadScope> {
  const id = ctx.url.searchParams.get("project");
  if (!id) return fail(400, "Add ?project=<project id>, or ?project=all&org=<organization id>.");
  if (id !== ALL_PROJECTS) {
    const access = await requireProject(ctx, id);
    return { orgId: access.project.orgId, projects: [access.project], project: access.project, access, scope: projectScope(access.project) };
  }
  const orgId = ctx.url.searchParams.get("org");
  if (!orgId) return fail(400, "Add &org=<organization id> to read all of its projects.");
  const a = await requireOrgRead(ctx, orgId);
  const scope = tenantScope(orgId, a.projects.map((p) => p.id), projectLabels(a.projects));
  return { orgId, projects: a.projects, project: null, access: null, scope };
}

/** How long the read keeps data: the longest of its projects (older rows of the others are gone by then). */
export async function scopeRetentionMs(app: CloudApp, projects: readonly ProjectRef[]): Promise<number> {
  const each = await Promise.all(projects.map((p) => projectRetentionMs(app.db, p.id, app.config.retentionDays)));
  return Math.max(...each);
}

/** The read's thresholds: its projects' when they all agree, else the cloud's. */
export async function scopeFacts(app: CloudApp, projects: readonly ProjectRef[]): Promise<{ slowQueryMs: number; nPlusOneThreshold: number }> {
  const each = await Promise.all(projects.map(async (p) => factsWith(app.config, await app.settings.get(p.id))));
  const pick = (k: "slowQueryMs" | "nPlusOneThreshold") => (new Set(each.map((f) => f[k])).size === 1 ? each[0]![k]! : factsWith(app.config, undefined)[k]!);
  return { slowQueryMs: pick("slowQueryMs"), nPlusOneThreshold: pick("nPlusOneThreshold") };
}
