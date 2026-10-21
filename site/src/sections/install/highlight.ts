export type Token = { text: string; kind: "kw" | "str" | "com" | "fn" | "type" | "plain" };

const KEYWORDS = new Set([
  "using", "var", "const", "let", "import", "from", "export", "async", "function", "await", "if", "return", "new", "true", "false", "defer", "func",
]);

const PATTERN = /((?<!:)\/\/.*$|#.*$|"(?:[^"\\]|\\.)*"|`[^`]*`|\b[A-Za-z_][\w.]*\b|\s+|.)/gm;

function kindOf(word: string, next: string): Token["kind"] {
  if (KEYWORDS.has(word)) return "kw";
  if (/^[A-Z]/.test(word) && !word.includes(".")) return "type";
  if (next === "(" || next === "<") return "fn";
  return "plain";
}

// A small highlighter for the install snippets: keywords, strings, comments, calls, and types.
export function tokenize(line: string): Token[] {
  const out: Token[] = [];
  const parts = line.match(PATTERN) ?? [];
  parts.forEach((part, i) => {
    if (part.startsWith("//") || part.startsWith("#")) out.push({ text: part, kind: "com" });
    else if (part.startsWith('"') || part.startsWith("`")) out.push({ text: part, kind: "str" });
    else if (/^[A-Za-z_]/.test(part)) {
      const last = part.split(".").pop() ?? part;
      const head = part.slice(0, part.length - last.length);
      if (head) out.push({ text: head, kind: "plain" });
      out.push({ text: last, kind: kindOf(last, parts[i + 1] ?? "") });
    } else out.push({ text: part, kind: "plain" });
  });
  return out;
}
