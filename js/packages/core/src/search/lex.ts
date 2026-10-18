// Splits a search into tokens. Quoted and escaped characters are literal: they never act as syntax.
import { SearchError } from "./ast.js";

/** One character of a term; `lit` when it was quoted or escaped. */
export interface Ch {
  c: string;
  lit: boolean;
}

export type Token =
  | { type: "(" | ")" | "OR" | "AND" | "NOT"; start: number; end: number }
  | { type: "term"; chars: Ch[]; neg: boolean; start: number; end: number };

const SPACE = /\s/;
const KEYWORDS = new Set(["OR", "AND", "NOT"]);

/** Reads a quoted part starting at `i` (the quote). Returns the index after the closing quote. */
function readQuoted(src: string, i: number, out: Ch[]): number {
  let j = i + 1;
  while (j < src.length && src[j] !== '"') {
    if (src[j] === "\\" && j + 1 < src.length) j++;
    out.push({ c: src[j]!, lit: true });
    j++;
  }
  if (j >= src.length) throw new SearchError("This quote is never closed.", i, src.length);
  return j + 1;
}

/** Reads one term from `i` up to a space or an unquoted parenthesis. */
function readTerm(src: string, i: number): { chars: Ch[]; end: number } {
  const chars: Ch[] = [];
  let j = i;
  while (j < src.length && !SPACE.test(src[j]!) && src[j] !== "(" && src[j] !== ")") {
    if (src[j] === '"') j = readQuoted(src, j, chars);
    else if (src[j] === "\\" && j + 1 < src.length) {
      chars.push({ c: src[j + 1]!, lit: true });
      j += 2;
    } else chars.push({ c: src[j++]!, lit: false });
  }
  return { chars, end: j };
}

const plain = (chars: readonly Ch[]): string | null => (chars.every((ch) => !ch.lit) ? chars.map((ch) => ch.c).join("") : null);

/** The tokens of a search, in order. */
export function lex(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (SPACE.test(c)) i++;
    else if (c === "(" || c === ")") out.push({ type: c, start: i, end: ++i });
    else {
      const neg = c === "-" && i + 1 < src.length && !SPACE.test(src[i + 1]!);
      const { chars, end } = readTerm(src, neg ? i + 1 : i);
      const word = plain(chars);
      if (!neg && word !== null && KEYWORDS.has(word)) out.push({ type: word as "OR" | "AND" | "NOT", start: i, end });
      else if (chars.length || neg) out.push({ type: "term", chars, neg, start: i, end });
      else if (end === i) throw new SearchError("Unexpected character.", i, i + 1);
      i = end;
    }
  }
  return out;
}
