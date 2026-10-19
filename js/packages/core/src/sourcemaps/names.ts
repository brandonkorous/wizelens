// The name of the function around a line of original source. Maps name tokens, not functions, so the source is read instead.

const ID = "[A-Za-z_$][\\w$]*";
const DECLARATIONS = [
  new RegExp(`function\\s*\\*?\\s*(${ID})\\s*\\(`),
  new RegExp(`(?:const|let|var)\\s+(${ID})\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)[^=]*=>|${ID}\\s*=>)`),
  new RegExp(`(${ID})\\s*:\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)[^=]*=>)`),
  new RegExp(`^\\s*(?:(?:public|private|protected|static|async|override|get|set)\\s+)*(${ID})\\s*(?:<[^>]*>)?\\([^)]*\\)[^{;]*\\{`),
];
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "function", "return", "with", "do", "else"]);
const LOOK_BACK = 300;

const count = (s: string, ch: string) => s.split(ch).length - 1;

function declared(line: string): string | null {
  for (const re of DECLARATIONS) {
    const m = re.exec(line);
    if (m && !KEYWORDS.has(m[1]!)) return m[1]!;
  }
  return null;
}

/** The function that holds a 1-based line and column of `content`, or null. Blocks closed before the line are skipped. */
export function enclosingName(content: string, line: number, column: number): string | null {
  const lines = content.split(/\r?\n/);
  if (line < 1 || line > lines.length) return null;
  let depth = 0;
  for (let i = line - 1; i >= 0 && i >= line - LOOK_BACK; i--) {
    const text = i === line - 1 ? lines[i]!.slice(0, Math.max(0, column - 1)) : lines[i]!;
    depth += count(text, "}") - count(text, "{");
    const name = declared(text);
    // The line opens a block that is still open at the frame, or is the frame's own one-line arrow.
    if (name && (depth < 0 || i === line - 1)) return name;
    if (depth < 0) depth = 0;
  }
  return null;
}
