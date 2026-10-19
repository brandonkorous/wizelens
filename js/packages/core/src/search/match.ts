// The memory compiler: a search tree becomes a predicate over search documents (in-app and the browser).
import { levelRank } from "../stats/logs.js";
import type { AttributeValue, Attributes, LogLevel } from "../types.js";
import { type Cmp, type Piece, SEARCH_FIELDS, type SearchField, type SearchKind, type SearchNode, type SearchValue } from "./ast.js";

export type DocValue = string | number | boolean | null | undefined | readonly string[];

/** One thing a search can find, as the compiler reads it. Build them with the helpers in docs.ts. */
export interface SearchDoc {
  kind: SearchKind;
  /** Lowercased text that free words search. */
  text: readonly string[];
  /** Known field values; `outcome` is the span status (ok, error, unset). */
  fields: Partial<Record<SearchField | "outcome", DocValue>>;
  /** Attribute maps; a trace has one per span, and any of them may match. */
  attrs: readonly Attributes[];
}

export type SearchPredicate = (doc: SearchDoc) => boolean;

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A case-insensitive regex for wildcard pieces. */
export const patternRegex = (pieces: readonly Piece[]): RegExp => new RegExp(`^${pieces.map((p) => (p === null ? "[\\s\\S]*" : escape(p))).join("")}$`, "i");

function compare(a: number, cmp: Cmp, b: number): boolean {
  if (cmp === ">") return a > b;
  if (cmp === ">=") return a >= b;
  if (cmp === "<") return a < b;
  if (cmp === "<=") return a <= b;
  return a === b;
}

const present = (v: unknown): boolean => v !== null && v !== undefined && v !== "";

/** A stored value as a number: numbers, and text that reads as one. Booleans and blanks are not numbers. */
export function numberOf(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** A test for one stored value (text, number, or boolean) against a query value. */
function valueTest(value: SearchValue, cmp: Cmp, prefix: boolean): (v: AttributeValue) => boolean {
  switch (value.type) {
    case "exists":
      return present;
    case "string": {
      const want = value.value.toLowerCase();
      return prefix ? (v) => present(v) && String(v).toLowerCase().startsWith(want) : (v) => present(v) && String(v).toLowerCase() === want;
    }
    case "pattern": {
      const re = patternRegex(value.pieces);
      return (v) => present(v) && re.test(String(v));
    }
    case "number":
      return (v) => {
        const n = numberOf(v);
        return n !== null && compare(n, cmp, value.value);
      };
    case "bool":
      return (v) => v === value.value;
    case "statusClass":
      return (v) => typeof v === "number" && Math.floor(v / 100) === value.value;
    case "level": {
      const rank = levelRank(value.value);
      return (v) => typeof v === "string" && levelRank(v as LogLevel) >= 0 && compare(levelRank(v as LogLevel), cmp, rank);
    }
    default:
      return (v) => typeof v === "string" && v === value.value;
  }
}

/** Any element of an array value, or the value itself. */
const anyOf = (test: (v: AttributeValue) => boolean) => (v: DocValue) => (Array.isArray(v) ? v.some(test) : test(v as AttributeValue));

function fieldPredicate(n: Extract<SearchNode, { type: "field" }>): SearchPredicate {
  if (n.field === "tag") return () => false;
  const kinds = SEARCH_FIELDS[n.field].kinds as readonly SearchKind[];
  const key = n.field === "status" && n.value.type === "spanStatus" ? "outcome" : n.field;
  const test = anyOf(valueTest(n.value, n.cmp, SEARCH_FIELDS[n.field].type === "id"));
  return (doc) => kinds.includes(doc.kind) && test(doc.fields[key]);
}

function attrPredicate(n: Extract<SearchNode, { type: "attr" }>): SearchPredicate {
  const test = valueTest(n.value, n.cmp, false);
  return (doc) => doc.attrs.some((a) => Object.hasOwn(a, n.key) && test(a[n.key]!));
}

/** A predicate for a search tree; null matches everything. Expand `tag:` first (tags/expand.ts): left as is, it matches nothing. */
export function compileSearch(node: SearchNode | null): SearchPredicate {
  if (!node) return () => true;
  switch (node.type) {
    case "and": {
      const parts = node.items.map(compileSearch);
      return (doc) => parts.every((p) => p(doc));
    }
    case "or": {
      const parts = node.items.map(compileSearch);
      return (doc) => parts.some((p) => p(doc));
    }
    case "not": {
      const inner = compileSearch(node.item);
      return (doc) => !inner(doc);
    }
    case "text": {
      const needle = node.value.toLowerCase();
      return (doc) => doc.text.some((t) => t.includes(needle));
    }
    case "field":
      return fieldPredicate(node);
    default:
      return attrPredicate(node);
  }
}
