// The search term under the caret, and how to put a suggestion in its place.
import { quoteText } from "@wizeworks/lens-core";

export interface TokenAt {
  start: number;
  end: number;
  /** The field before the colon ("service", "@user.id"), or null while typing a field name or a word. */
  field: string | null;
  /** What is typed so far: the field name, or the value after the colon and any comparison. */
  prefix: string;
  /** Text kept in front of the value: "-", "status:>=", and so on. */
  lead: string;
}

const STOP = /[\s()]/;

/** The term around `caret` in `text`. */
export function tokenAt(text: string, caret: number): TokenAt {
  let start = caret;
  while (start > 0 && !STOP.test(text[start - 1]!)) start--;
  let end = caret;
  while (end < text.length && !STOP.test(text[end]!)) end++;
  const raw = text.slice(start, end);
  const neg = raw.startsWith("-") ? "-" : "";
  const body = raw.slice(neg.length);
  const colon = body.indexOf(":");
  if (colon < 0) return { start, end, field: null, prefix: body, lead: neg };
  const field = body.slice(0, colon);
  const cmp = /^(>=|<=|>|<)/.exec(body.slice(colon + 1))?.[0] ?? "";
  const prefix = body.slice(colon + 1 + cmp.length).replace(/^"/, "").replace(/"$/, "");
  return { start, end, field, prefix, lead: `${neg}${field}:${cmp}` };
}

/** The text with the suggestion in place of the term, and where the caret goes. Fields end with ":", values with a space. */
export function applySuggestion(text: string, t: TokenAt, value: string): { text: string; caret: number } {
  const piece = t.field === null ? `${t.lead}${value}:` : `${t.lead}${quoteText(value)} `;
  const next = text.slice(0, t.start) + piece + text.slice(t.end).replace(/^ /, "");
  return { text: next, caret: t.start + piece.length };
}
