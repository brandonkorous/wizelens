/** One frame of a JavaScript stack trace. Line and column are 1-based. */
export interface StackFrame {
  /** Function name as the stack shows it, or null for anonymous code. */
  fn: string | null;
  /** The script URL (or file path) of the frame. */
  url: string;
  line: number;
  column: number;
  /** The frame's line in the stack, as it came. */
  raw: string;
}

// Chrome, Edge, and Node: "at fn (url:1:2)", "at url:1:2", "at async fn (url:1:2)".
const V8 = /^\s*at (?:async )?(?:(.*?) \()?(\S+?):(\d+):(\d+)\)?$/;
// Firefox and Safari: "fn@url:1:2", "@url:1:2".
const GECKO = /^\s*(.*?)@(\S+?):(\d+):(\d+)$/;
// Safari, for code without a name: "url:1:2".
const BARE = /^\s*((?:https?|file|webpack):\/\/\S+?):(\d+):(\d+)$/;

function frameOf(raw: string): StackFrame | null {
  if (raw.includes("eval at ") || raw.includes("(native)")) return null;
  const v8 = V8.exec(raw);
  if (v8) return { fn: v8[1] || null, url: v8[2]!, line: Number(v8[3]), column: Number(v8[4]), raw: raw.trim() };
  const gecko = GECKO.exec(raw);
  if (gecko) return { fn: gecko[1] || null, url: gecko[2]!, line: Number(gecko[3]), column: Number(gecko[4]), raw: raw.trim() };
  const bare = BARE.exec(raw);
  if (bare) return { fn: null, url: bare[1]!, line: Number(bare[2]), column: Number(bare[3]), raw: raw.trim() };
  return null;
}

/** The frames of a stack trace, top first. Lines that are not frames (the message, native code) are skipped. */
export function parseStack(stack: string | null | undefined, max = 50): StackFrame[] {
  if (!stack) return [];
  const out: StackFrame[] = [];
  for (const line of stack.split(/\r?\n/)) {
    const f = frameOf(line);
    if (f) out.push(f);
    if (out.length >= max) break;
  }
  return out;
}

/** The path of a frame's script without origin and query, for example "assets/index-abc.js". */
export function scriptPath(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/^\/+/, "");
  } catch {
    return url.replace(/[?#].*$/, "").replace(/\\/g, "/").replace(/^\/+/, "");
  }
}

/** Every trailing part of a script path, longest first: "a/b/c.js", "b/c.js", "c.js". Uploaded maps match one of them. */
export function pathSuffixes(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  return parts.map((_, i) => parts.slice(i).join("/"));
}
