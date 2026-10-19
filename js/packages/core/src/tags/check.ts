// Checks a tag rule a person sends, the same way on every host that keeps rules (hub and cloud).
import type { SearchNode } from "../search/ast.js";
import { checkSearch } from "../search/check.js";
import { BUILT_IN_TAGS, isBuiltInName, tagList } from "./builtins.js";
import { isTagColor, TAG_COLORS, TAG_LIMITS, TAG_NAME, type TagInput, type TagOptions, type TagRule } from "./types.js";

export type TagCheck = { ok: true; input: TagInput } | { ok: false; error: string; field: "name" | "color" | "query" };

/** True when the tree uses `tag:` anywhere. */
export function usesTags(n: SearchNode | null): boolean {
  if (!n) return false;
  if (n.type === "and" || n.type === "or") return n.items.some(usesTags);
  if (n.type === "not") return usesTags(n.item);
  return n.type === "field" && n.field === "tag";
}

function checkQuery(raw: unknown): TagCheck | string {
  const query = typeof raw === "string" ? raw.trim() : "";
  if (!query) return { ok: false, field: "query", error: "Set the search this tag stands for." };
  if (query.length > TAG_LIMITS.query) return { ok: false, field: "query", error: `A tag's search can be at most ${TAG_LIMITS.query} characters.` };
  const c = checkSearch(query);
  if (!c.ok) return { ok: false, field: "query", error: c.error };
  if (!c.node) return { ok: false, field: "query", error: "This search matches everything. Narrow it, such as service:api." };
  if (usesTags(c.node)) return { ok: false, field: "query", error: "A tag's search cannot use tag:. Copy the other tag's search in instead." };
  return query;
}

/** A rule from a request body. `taken` holds the names other rules in the project already use. */
export function checkTagInput(raw: unknown, taken: readonly string[]): TagCheck {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().toLowerCase() : "";
  if (!TAG_NAME.test(name)) return { ok: false, field: "name", error: `Name the tag with 1 to ${TAG_LIMITS.name} lowercase letters, digits, - or _.` };
  if (isBuiltInName(name)) return { ok: false, field: "name", error: `"${name}" is a built-in tag. Pick another name.` };
  if (taken.includes(name)) return { ok: false, field: "name", error: `A tag named "${name}" already exists here.` };
  const color = b.color ?? "blue";
  if (!isTagColor(color)) return { ok: false, field: "color", error: `Pick a color: ${TAG_COLORS.join(", ")}.` };
  const query = checkQuery(b.query);
  return typeof query === "string" ? { ok: true, input: { name, color, query } } : query;
}

/** The tags of an in-app add-on from its `tags` option. A rule that fails its check throws, so a typo shows at startup. */
export function tagsFromOptions(o: TagOptions | undefined): TagRule[] {
  const rules: TagRule[] = [];
  for (const raw of o?.rules ?? []) {
    const c = checkTagInput(raw, rules.map((r) => r.name));
    if (!c.ok) throw new Error(`WizeLens tags: ${c.error} (${JSON.stringify(raw)})`);
    rules.push({ id: c.input.name, ...c.input, builtIn: false, enabled: true });
  }
  const unknown = (o?.disableBuiltIns ?? []).filter((n) => !isBuiltInName(n));
  if (unknown.length) throw new Error(`WizeLens tags: no built-in tag named ${unknown.join(", ")}. Built-ins: ${BUILT_IN_TAGS.map((t) => t.name).join(", ")}.`);
  return tagList(rules, new Set(o?.disableBuiltIns));
}
