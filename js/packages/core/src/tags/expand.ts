// `tag:` in a search becomes the searches it stands for, before any host compiles the tree.
import { TAG_PREFIX } from "../attributes.js";
import type { SearchNode } from "../search/ast.js";
import { patternRegex } from "../search/match.js";
import type { SearchQuery } from "../search/run.js";
import type { ActiveTag } from "./types.js";

/** Matches nothing: NOT of an empty AND, as the parser reads `-*`. */
export const NOTHING: SearchNode = { type: "not", item: { type: "and", items: [] } };

export interface ExpandedSearch {
  node: SearchNode | null;
  /** Names after `tag:` that no rule has; they match only tags the app sets. */
  unknownTags: string[];
}

const anyOf = (items: SearchNode[]): SearchNode => (items.length === 0 ? NOTHING : items.length === 1 ? items[0]! : { type: "or", items });

/** A tag the app sets: `wizelens.tag.key` is there, or holds `value`. */
const appTag = (key: string, value?: string): SearchNode =>
  ({ type: "attr", key: `${TAG_PREFIX}${key}`, cmp: "=", value: value === undefined ? { type: "exists" } : { type: "string", value } });

/** One `tag:` leaf: a rule by name, an app tag by key (or `key:value`), or every rule whose name fits a pattern. */
function tagNode(n: Extract<SearchNode, { type: "field" }>, tags: readonly ActiveTag[], unknown: Set<string>): SearchNode {
  const v = n.value;
  if (v.type === "exists") return anyOf(tags.map((t) => t.node));
  if (v.type === "pattern") {
    const re = patternRegex(v.pieces);
    return anyOf(tags.filter((t) => re.test(t.name)).map((t) => t.node));
  }
  if (v.type !== "string") return NOTHING;
  const colon = v.value.indexOf(":");
  if (colon > 0) return appTag(v.value.slice(0, colon), v.value.slice(colon + 1));
  const rule = tags.find((t) => t.name === v.value.toLowerCase());
  if (!rule) unknown.add(v.value.toLowerCase());
  return anyOf([...(rule ? [rule.node] : []), appTag(v.value)]);
}

function expandNode(n: SearchNode, tags: readonly ActiveTag[], unknown: Set<string>): SearchNode {
  if (n.type === "and" || n.type === "or") return { type: n.type, items: n.items.map((i) => expandNode(i, tags, unknown)) };
  if (n.type === "not") return { type: "not", item: expandNode(n.item, tags, unknown) };
  return n.type === "field" && n.field === "tag" ? tagNode(n, tags, unknown) : n;
}

/** The tree with every `tag:` replaced, and the names that matched no rule. Rules never use `tag:`, so one pass is enough. */
export function expandTags(node: SearchNode | null, tags: readonly ActiveTag[]): ExpandedSearch {
  const unknown = new Set<string>();
  return { node: node && expandNode(node, tags, unknown), unknownTags: [...unknown] };
}

/** A search query with its tags expanded, ready for any runner; hosts send `unknownTags` back with the page. */
export function expandQuery<Q extends SearchQuery>(q: Q, tags: readonly ActiveTag[]): { query: Q; unknownTags: string[] } {
  const e = expandTags(q.node, tags);
  return { query: { ...q, node: e.node }, unknownTags: e.unknownTags };
}
