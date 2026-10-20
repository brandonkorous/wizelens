/** Longest document kept on a span, in characters. */
const MAX_DOCUMENT = 8192;
const NAME_START = /[_A-Za-z]/;
const NAME_PART = /[_0-9A-Za-z]/;
const NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/;

/** The source location graphql-js keeps on a parsed document. */
export interface LocationLike {
  start: number;
  end: number;
  source?: { body?: unknown };
}

/** End of the string literal that starts at `i`: a block string ("""), or a quoted string with escapes. */
function stringEnd(text: string, i: number): number {
  if (text.startsWith('"""', i)) {
    let j = i + 3;
    while (j < text.length && !text.startsWith('"""', j)) j += text.startsWith('\\"""', j) ? 4 : 1;
    return Math.min(j + 3, text.length);
  }
  let j = i + 1;
  while (j < text.length && text[j] !== '"' && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
  return Math.min(j + 1, text.length);
}

/** End of the name that starts at `i`. */
function nameEnd(text: string, i: number): number {
  let j = i + 1;
  while (j < text.length && NAME_PART.test(text[j]!)) j++;
  return j;
}

/** One step of the scrubber: what to write for the token at `i`, and where the next token starts. */
function step(text: string, i: number): [string, number] {
  const c = text[i]!;
  if (c === "#") {
    const eol = text.indexOf("\n", i);
    return [" ", eol < 0 ? text.length : eol];
  }
  if (c === '"') return ['"*"', stringEnd(text, i)];
  if (NAME_START.test(c)) {
    const end = nameEnd(text, i);
    return [text.slice(i, end), end];
  }
  const number = c === "-" || (c >= "0" && c <= "9") ? NUMBER.exec(text.slice(i, i + 64)) : null;
  if (number) return ["*", i + number[0].length];
  return [c, i + 1];
}

/** A GraphQL document with every literal value (string, number) replaced by `*` and comments removed. Variables stay as `$name`. */
export function scrubDocument(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; ) {
    const [piece, next] = step(text, i);
    out += piece;
    i = next;
  }
  const flat = out.replace(/\s+/g, " ").trim();
  return flat.length > MAX_DOCUMENT ? `${flat.slice(0, MAX_DOCUMENT)}…` : flat;
}

/** The scrubbed source of a parsed document, or undefined when it was parsed without locations. */
export function documentText(loc: LocationLike | undefined): string | undefined {
  const body = loc?.source?.body;
  if (typeof body !== "string") return undefined;
  return scrubDocument(body.slice(loc!.start, loc!.end));
}
