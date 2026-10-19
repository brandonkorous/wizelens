import { newId, slugOf } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";
import { METRIC_TABLES } from "./metric-write.js";
import { STATS_TABLES } from "../settle.js";

export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  /** Days log lines are kept, or null for the organization's retention. */
  logRetentionDays: number | null;
}

const COLUMNS = `id, org_id AS "orgId", name, slug, log_retention_days AS "logRetentionDays"`;

export async function createProject(q: Queryable, orgId: string, name: string, now: number): Promise<Project> {
  const base = slugOf(name);
  const taken = new Set((await q.query<{ slug: string }>("SELECT slug FROM projects WHERE org_id = $1", [orgId])).map((r) => r.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  const p = { id: newId(), orgId, name: name.trim().slice(0, 100) || slug, slug, logRetentionDays: null };
  await q.query("INSERT INTO projects (id, org_id, name, slug, created_ms) VALUES ($1, $2, $3, $4, $5)", [p.id, orgId, p.name, slug, now]);
  return p;
}

export const listProjects = (q: Queryable, orgId: string): Promise<Project[]> =>
  q.query<Project>(`SELECT ${COLUMNS} FROM projects WHERE org_id = $1 ORDER BY name`, [orgId]);

export async function projectInOrg(q: Queryable, orgId: string, projectId: string): Promise<Project | undefined> {
  const [row] = await q.query<Project>(`SELECT ${COLUMNS} FROM projects WHERE org_id = $1 AND id = $2`, [orgId, projectId]);
  return row;
}

/** Delete a project and all of its data. */
export async function deleteProject(q: Queryable, projectId: string): Promise<void> {
  await deleteProjectData(q, projectId);
  await q.query("DELETE FROM api_keys WHERE project_ids = $1", [JSON.stringify([projectId])]);
  await q.query("DELETE FROM projects WHERE id = $1", [projectId]);
}

/** Delete every trace, span, log, service, metric, and stat of a project. The project and its settings stay. */
export async function deleteProjectData(q: Queryable, projectId: string): Promise<void> {
  for (const table of ["spans", "logs", "traces", "services", "metric_points", ...METRIC_TABLES, ...STATS_TABLES]) await q.query(`DELETE FROM ${table} WHERE project_id = $1`, [projectId]);
}

export * from "./keys.js";
