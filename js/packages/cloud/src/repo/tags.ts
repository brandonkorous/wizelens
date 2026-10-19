import { BUILT_IN_PREFIX, isBuiltInName, type TagColor, type TagInput, type TagRule, tagList } from "@wizeworks/lens-core";
import { newId } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";

// Tag rules per project (docs/TAGS-PLAN.md), in Postgres even when telemetry is in ClickHouse.

interface RuleRow {
  id: string;
  name: string;
  color: string;
  query: string;
}

/** Built-ins first (minus those the project turned off), then its rules by name. */
export async function projectTags(q: Queryable, projectId: string): Promise<TagRule[]> {
  const rows = await q.query<RuleRow>("SELECT id, name, color, query FROM tag_rules WHERE project_id = $1", [projectId]);
  const off = await q.query<{ name: string }>("SELECT name FROM tag_builtins WHERE project_id = $1 AND NOT enabled", [projectId]);
  const rules = rows.map((r): TagRule => ({ id: r.id, name: r.name, color: r.color as TagColor, query: r.query, builtIn: false, enabled: true }));
  return tagList(rules, new Set(off.map((r) => r.name)));
}

export async function createTag(q: Queryable, projectId: string, input: TagInput, actor: string, now: number): Promise<TagRule> {
  const id = newId();
  const sql = "INSERT INTO tag_rules (project_id, id, name, color, query, created_by, created_ms, updated_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)";
  await q.query(sql, [projectId, id, input.name, input.color, input.query, actor, now]);
  return { id, ...input, builtIn: false, enabled: true };
}

export async function updateTag(q: Queryable, projectId: string, id: string, input: TagInput, now: number): Promise<void> {
  const sql = "UPDATE tag_rules SET name = $3, color = $4, query = $5, updated_ms = $6 WHERE project_id = $1 AND id = $2";
  await q.query(sql, [projectId, id, input.name, input.color, input.query, now]);
}

/** False when the project has no rule with this id. */
export async function deleteTag(q: Queryable, projectId: string, id: string): Promise<boolean> {
  return (await q.query("DELETE FROM tag_rules WHERE project_id = $1 AND id = $2 RETURNING id", [projectId, id])).length > 0;
}

/** Turn a built-in on or off for one project; false when `id` is not a built-in. */
export async function setBuiltIn(q: Queryable, projectId: string, id: string, enabled: boolean): Promise<boolean> {
  const name = id.startsWith(BUILT_IN_PREFIX) ? id.slice(BUILT_IN_PREFIX.length) : "";
  if (!isBuiltInName(name)) return false;
  const sql = "INSERT INTO tag_builtins (project_id, name, enabled) VALUES ($1, $2, $3) ON CONFLICT (project_id, name) DO UPDATE SET enabled = EXCLUDED.enabled";
  await q.query(sql, [projectId, name, enabled]);
  return true;
}
