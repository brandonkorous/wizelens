// A parse that never throws, for APIs: the tree, or an error with its position.
import { SearchError, type SearchNode } from "./ast.js";
import { parseSearch } from "./parse.js";

export type SearchCheck = { ok: true; node: SearchNode | null } | { ok: false; error: string; start: number; end: number };

export function checkSearch(src: string): SearchCheck {
  try {
    return { ok: true, node: parseSearch(src) };
  } catch (err) {
    if (err instanceof SearchError) return { ok: false, error: err.message, start: err.start, end: err.end };
    throw err;
  }
}
