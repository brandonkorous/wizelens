// Writes a search tree back as text. Parsing the text gives the same tree.
import type { Cmp, SearchNode, SearchValue } from "./ast.js";

const SPECIAL = /[\s"\\():*]|^[-<>]|^(OR|AND|NOT)$|\.\./;

/** Text as one term: bare when safe, else quoted with escapes. */
export function quoteText(s: string): string {
  return SPECIAL.test(s) || !s ? `"${s.replace(/["\\]/g, (c) => `\\${c}`)}"` : s;
}

/** A pattern: literal parts quoted when needed, `*` for "any text". */
const patternText = (pieces: readonly (string | null)[]): string => pieces.map((p) => (p === null ? "*" : quoteText(p))).join("");

function valueText(v: SearchValue): string {
  switch (v.type) {
    case "string":
      return quoteText(v.value);
    case "pattern":
      return patternText(v.pieces);
    case "number":
      return String(v.value);
    case "bool":
      return String(v.value);
    case "statusClass":
      return `${v.value}xx`;
    case "exists":
      return "*";
    default:
      return v.value;
  }
}

/** Durations print in ms, so the text parses back to the same number. */
const leafText = (name: string, cmp: Cmp, v: SearchValue, ms: boolean): string =>
  `${name}:${cmp === "=" ? "" : cmp}${ms && v.type === "number" ? `${v.value}ms` : valueText(v)}`;

/** One node as text; `inner` adds parentheses where the parent binds tighter. */
function nodeText(n: SearchNode, inner: boolean): string {
  switch (n.type) {
    case "and":
      return n.items.length ? wrap(n.items.map((i) => nodeText(i, true)).join(" "), inner && n.items.length > 1) : "*";
    case "or":
      return wrap(n.items.map((i) => nodeText(i, true)).join(" OR "), inner);
    case "not":
      return n.item.type === "and" || n.item.type === "or" || n.item.type === "not" ? `NOT ${nodeText(n.item, true)}` : `-${nodeText(n.item, true)}`;
    case "text":
      return quoteText(n.value);
    case "field":
      return leafText(n.field, n.cmp, n.value, n.field === "duration");
    default:
      return leafText(`@${n.key}`, n.cmp, n.value, false);
  }
}

const wrap = (s: string, yes: boolean): string => (yes ? `(${s})` : s);

/** A search tree as text; null (match everything) is "". */
export const formatSearch = (n: SearchNode | null): string => (n ? nodeText(n, false) : "");
