// Tag rules: a name, a color, and a search, kept in settings and checked when data is shown (docs/TAGS-PLAN.md).
import type { SearchNode } from "../search/ast.js";

/** The colors a tag can have; the dashboard maps each to a theme token. */
export const TAG_COLORS = ["blue", "green", "amber", "orange", "red", "violet", "slate"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const isTagColor = (v: unknown): v is TagColor => typeof v === "string" && (TAG_COLORS as readonly string[]).includes(v);

export const TAG_LIMITS = { name: 40, query: 2000, rules: 50, matchItems: 200 } as const;

/** Lowercase letters, digits, `-` and `_`; starts with a letter or digit. */
export const TAG_NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** A tag rule as every host's `api/tags` lists it. Built-ins have ids like `builtin:stream`. */
export interface TagRule {
  id: string;
  name: string;
  color: TagColor;
  query: string;
  builtIn: boolean;
  enabled: boolean;
}

/** What a person sets on a rule they make. */
export interface TagInput {
  name: string;
  color: TagColor;
  query: string;
}

/** A rule ready to run: its name, color, and parsed search. */
export interface ActiveTag {
  name: string;
  color: TagColor;
  node: SearchNode;
}

/** The `tags` option of the in-app add-ons: rules kept in code, and built-ins to turn off. */
export interface TagOptions {
  rules?: { name: string; query: string; color?: TagColor }[];
  disableBuiltIns?: string[];
}

/** The body of `GET api/tags`. */
export interface TagList {
  tags: TagRule[];
  /** True when this caller may add, change, and delete rules here. */
  editable: boolean;
  max: number;
}
