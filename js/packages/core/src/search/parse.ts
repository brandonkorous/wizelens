// Parses a search into a tree: OR binds loosest, then AND (also implied by a space), then NOT and `-`.
import { type Cmp, isSearchField, SEARCH_FIELDS, SEARCH_LIMITS, SearchError, type SearchNode, type SearchValue } from "./ast.js";
import { type Ch, lex, type Token } from "./lex.js";
import { attrValue, fieldValue, ORDERED, ValueError } from "./values.js";

const FIELD_NAME = /^@?[A-Za-z_][\w.-]*$/;
const CMPS: readonly Cmp[] = [">=", "<=", ">", "<"];

type TermToken = Extract<Token, { type: "term" }>;

const plainText = (chars: readonly Ch[]): string => chars.map((ch) => ch.c).join("");

/** The comparison at the start of a value, and the rest. Quoted or escaped characters are never part of it. */
function splitCmp(chars: readonly Ch[]): { cmp: Cmp; rest: Ch[] } {
  const lit = chars.findIndex((ch) => ch.lit);
  const head = chars.slice(0, lit < 0 ? 2 : Math.min(2, lit)).map((ch) => ch.c).join("");
  const cmp = CMPS.find((c) => head.startsWith(c));
  return cmp ? { cmp, rest: chars.slice(cmp.length) } : { cmp: "=", rest: [...chars] };
}

/** Index of an unquoted "..", or -1. */
function rangeAt(chars: readonly Ch[]): number {
  for (let i = 0; i + 1 < chars.length; i++) if (chars[i]!.c === "." && chars[i + 1]!.c === "." && !chars[i]!.lit && !chars[i + 1]!.lit) return i;
  return -1;
}

const leaf = (name: string, cmp: Cmp, value: SearchValue): SearchNode =>
  name.startsWith("@") ? { type: "attr", key: name.slice(1), cmp, value } : { type: "field", field: name as keyof typeof SEARCH_FIELDS, cmp, value };

/** One `name:value` part, already split at the colon. */
function fieldNode(t: TermToken, name: string, chars: Ch[]): SearchNode {
  const attr = name.startsWith("@");
  if (!attr && !isSearchField(name)) throw new SearchError(`Unknown field "${name}". Use @${name} for an attribute, or put the text in quotes.`, t.start, t.end);
  const type = attr ? null : SEARCH_FIELDS[name as keyof typeof SEARCH_FIELDS].type;
  const valueOf = (c: readonly Ch[], cmp: Cmp) => (type ? fieldValue(type, c, cmp) : attrValue(c, cmp));
  const { cmp, rest } = splitCmp(chars);
  if (!rest.length) throw new SearchError(`${name} needs a value.`, t.start, t.end);
  try {
    if (cmp === "=" && rest.length === 1 && rest[0]!.c === "*" && !rest[0]!.lit) return leaf(name, "=", { type: "exists" });
    const dots = cmp === "=" ? rangeAt(rest) : -1;
    if (dots < 0) return leaf(name, cmp, valueOf(rest, cmp));
    if (type && !ORDERED.has(type)) throw new ValueError(`${name} cannot take a range.`);
    const [lo, hi] = [rest.slice(0, dots), rest.slice(dots + 2)];
    if (!lo.length || !hi.length) throw new ValueError("A range needs both ends, such as 200..299.");
    return { type: "and", items: [leaf(name, ">=", valueOf(lo, ">=")), leaf(name, "<=", valueOf(hi, "<="))] };
  } catch (err) {
    if (err instanceof ValueError) throw new SearchError(err.message, t.start, t.end);
    throw err;
  }
}

/** A term as a node, or null when it matches everything (a lone `*`). `name://` is a URL, so it is text. */
function termNode(t: TermToken): SearchNode | null {
  const colon = t.chars.findIndex((ch) => ch.c === ":" && !ch.lit);
  const head = colon > 0 ? t.chars.slice(0, colon) : [];
  const name = head.every((ch) => !ch.lit) ? plainText(head) : "";
  const url = t.chars[colon + 1]?.c === "/" && t.chars[colon + 2]?.c === "/";
  const node = FIELD_NAME.test(name) && !url ? fieldNode(t, name, t.chars.slice(colon + 1)) : textNode(t.chars);
  if (!node) return t.neg ? { type: "not", item: { type: "and", items: [] } } : null;
  return t.neg ? { type: "not", item: node } : node;
}

function textNode(chars: readonly Ch[]): SearchNode | null {
  const value = chars.filter((ch) => ch.lit || ch.c !== "*").map((ch) => ch.c).join("");
  return value ? { type: "text", value } : null;
}

/** Flattens nested ANDs and ORs, and unwraps single items. */
function join(type: "and" | "or", items: SearchNode[]): SearchNode {
  const flat = items.flatMap((n) => (n.type === type ? n.items : [n]));
  return flat.length === 1 ? flat[0]! : { type, items: flat };
}

class Parser {
  private i = 0;
  private terms = 0;

  constructor(
    private readonly src: string,
    private readonly tokens: Token[],
  ) {}

  parse(): SearchNode | null {
    if (!this.tokens.length) return null;
    const node = this.or(0);
    const extra = this.tokens[this.i];
    if (extra) throw new SearchError(extra.type === ")" ? "This ) has no matching (." : "Unexpected text.", extra.start, extra.end);
    return node.type === "and" && !node.items.length ? null : node;
  }

  private or(depth: number): SearchNode {
    const first = this.tokens[this.i];
    if (first?.type === "OR") throw new SearchError("OR needs something before it.", first.start, first.end);
    const items = [this.and(depth)];
    while (this.peek("OR")) {
      const op = this.tokens[this.i++]!;
      if (this.atEnd() || this.peek("OR")) throw new SearchError("OR needs something after it.", op.start, op.end);
      items.push(this.and(depth));
    }
    return join("or", items);
  }

  private and(depth: number): SearchNode {
    const items: SearchNode[] = [];
    while (!this.atEnd() && !this.peek("OR")) {
      if (this.peek("AND")) {
        const op = this.tokens[this.i++]!;
        if (!items.length || this.atEnd()) throw new SearchError("AND needs something on both sides.", op.start, op.end);
      }
      const node = this.unary(depth);
      if (node) items.push(node);
    }
    return join("and", items);
  }

  private unary(depth: number): SearchNode | null {
    if (depth > SEARCH_LIMITS.depth) throw new SearchError("Too many nested parts.", this.tokens[this.i]!.start, this.src.length);
    const t = this.tokens[this.i++]!;
    if (t.type === "NOT") return this.negate(t, depth);
    if (t.type === "(") return this.group(t, depth);
    if (t.type !== "term") throw new SearchError(`Unexpected ${t.type}.`, t.start, t.end);
    if (++this.terms > SEARCH_LIMITS.terms) throw new SearchError(`A search can have at most ${SEARCH_LIMITS.terms} parts.`, t.start, t.end);
    if (t.neg && !t.chars.length) return this.negate(t, depth);
    return termNode(t);
  }

  private negate(t: Token, depth: number): SearchNode {
    if (this.atEnd() || this.peek(")") || this.peek("OR")) throw new SearchError("NOT needs something after it.", t.start, t.end);
    const item = this.unary(depth + 1);
    return { type: "not", item: item ?? { type: "and", items: [] } };
  }

  private group(open: Token, depth: number): SearchNode | null {
    if (this.peek(")")) throw new SearchError("These parentheses are empty.", open.start, this.tokens[this.i]!.end);
    const node = this.or(depth + 1);
    if (!this.peek(")")) throw new SearchError("This ( is never closed.", open.start, open.end);
    this.i++;
    return node.type === "and" && !node.items.length ? null : node;
  }

  private peek(type: Token["type"]): boolean {
    return this.tokens[this.i]?.type === type;
  }

  private atEnd(): boolean {
    return this.i >= this.tokens.length || this.peek(")");
  }
}

/** The tree of a search, or null when it matches everything. Throws a SearchError with a position. */
export function parseSearch(src: string): SearchNode | null {
  if (src.length > SEARCH_LIMITS.chars) throw new SearchError(`A search can be at most ${SEARCH_LIMITS.chars} characters.`, SEARCH_LIMITS.chars, src.length);
  return new Parser(src, lex(src)).parse();
}
