import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { BUILT_IN_PREFIX, isBuiltInName, type TagColor, type TagInput, type TagRule, tagList } from "@wizeworks/lens-core";

// Tag rules on the hub (docs/TAGS-PLAN.md): one set for the whole hub, kept in its SQLite file, apart from the telemetry.

interface RuleRow {
  id: string;
  name: string;
  color: string;
  query: string;
}

const ruleOf = (r: RuleRow): TagRule => ({ id: r.id, name: r.name, color: r.color as TagColor, query: r.query, builtIn: false, enabled: true });

/** Built-ins first (minus those turned off), then the hub's rules by name. */
export function hubTags(db: DatabaseSync): TagRule[] {
  const rules = (db.prepare("SELECT id, name, color, query FROM tag_rules").all() as unknown as RuleRow[]).map(ruleOf);
  const off = db.prepare("SELECT name FROM tag_builtins WHERE enabled = 0").all() as { name: string }[];
  return tagList(rules, new Set(off.map((r) => r.name)));
}

export function createTag(db: DatabaseSync, input: TagInput, now: number): TagRule {
  const id = randomUUID();
  db.prepare("INSERT INTO tag_rules (id, name, color, query, created_ms, updated_ms) VALUES (?, ?, ?, ?, ?, ?)").run(id, input.name, input.color, input.query, now, now);
  return { id, ...input, builtIn: false, enabled: true };
}

/** Change a rule; false when there is none with this id. */
export function updateTag(db: DatabaseSync, id: string, input: TagInput, now: number): boolean {
  const r = db.prepare("UPDATE tag_rules SET name = ?, color = ?, query = ?, updated_ms = ? WHERE id = ?").run(input.name, input.color, input.query, now, id);
  return Number(r.changes) > 0;
}

export function deleteTag(db: DatabaseSync, id: string): boolean {
  return Number(db.prepare("DELETE FROM tag_rules WHERE id = ?").run(id).changes) > 0;
}

/** Turn a built-in on or off; false when `id` is not a built-in. */
export function setBuiltIn(db: DatabaseSync, id: string, enabled: boolean): boolean {
  const name = id.startsWith(BUILT_IN_PREFIX) ? id.slice(BUILT_IN_PREFIX.length) : "";
  if (!isBuiltInName(name)) return false;
  db.prepare("INSERT INTO tag_builtins (name, enabled) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET enabled = excluded.enabled").run(name, enabled ? 1 : 0);
  return true;
}
