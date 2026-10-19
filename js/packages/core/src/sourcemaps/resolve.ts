import { originalPosition, type SourceMap } from "./map.js";
import { enclosingName } from "./names.js";
import { parseStack, type StackFrame } from "./stack.js";

/** Finds the source map of a script URL, for a release (null when the app sent none). */
export type MapLoader = (url: string, release: string | null) => Promise<SourceMap | null>;

/** A few lines of original source around a frame. `start` is the 1-based number of the first line. */
export interface SourceContext {
  start: number;
  lines: string[];
}

/** A stack frame after source maps. The raw frame is always kept. */
export interface ResolvedFrame {
  raw: StackFrame;
  /** Original file for display, for example "src/cart/Checkout.tsx". Null when no map covers the frame. */
  source: string | null;
  line: number | null;
  column: number | null;
  /** The original function name, or the raw one. */
  fn: string | null;
  /** False for library code (node_modules) and bundler runtime. */
  inApp: boolean;
  context: SourceContext | null;
}

export interface ResolveOptions {
  /** Lines of source before and after the frame's line. Default 3; 0 leaves context out. */
  context?: number;
  /** Most frames resolved. Default 50. */
  maxFrames?: number;
}

const MAX_LINE = 300;
const LIBRARY = /(^|\/)node_modules\/|^webpack\/(bootstrap|runtime)|^\(webpack\)|^vite\/|^\0/;

/** A source path for display: no bundler scheme, query, or leading "../"; library code from node_modules on. */
export function displaySource(source: string): string {
  let s = source.replace(/\\/g, "/").replace(/[?#].*$/, "");
  s = s.replace(/^webpack:\/\/[^/]*\//, "").replace(/^[a-z]+:\/\/\/?/i, "");
  const lib = s.lastIndexOf("node_modules/");
  if (lib >= 0) return s.slice(lib);
  while (/^\.\.?\//.test(s)) s = s.replace(/^\.\.?\//, "");
  const src = s.indexOf("/src/");
  if (src >= 0 && (/^[a-z]:\//i.test(s) || s.startsWith("/"))) return s.slice(src + 1);
  return s.replace(/^\/+/, "");
}

const isInApp = (source: string | null, url: string) => !LIBRARY.test(source ?? "") && !url.includes("/node_modules/");

function contextOf(content: string | null, line: number, around: number): SourceContext | null {
  if (!content || around <= 0) return null;
  const all = content.split(/\r?\n/);
  const start = Math.max(1, line - around);
  const lines = all.slice(start - 1, Math.min(all.length, line + around)).map((l) => (l.length > MAX_LINE ? `${l.slice(0, MAX_LINE)}…` : l));
  return lines.length ? { start, lines } : null;
}

function resolveFrame(raw: StackFrame, map: SourceMap | null, around: number): ResolvedFrame {
  const pos = map ? originalPosition(map, raw.line, raw.column) : null;
  if (!pos) return { raw, source: null, line: null, column: null, fn: raw.fn, inApp: isInApp(null, raw.url), context: null };
  const source = displaySource(pos.source);
  const fn = (pos.content ? enclosingName(pos.content, pos.line, pos.column) : null) ?? raw.fn;
  return { raw, source, line: pos.line, column: pos.column, fn, inApp: isInApp(source, raw.url), context: contextOf(pos.content, pos.line, around) };
}

/** Resolve every frame of a stack with the maps the loader finds. Each script's map loads once. Never throws. */
export async function resolveStack(stack: string | null, release: string | null, load: MapLoader, o: ResolveOptions = {}): Promise<ResolvedFrame[]> {
  const frames = parseStack(stack, o.maxFrames ?? 50);
  const maps = new Map<string, Promise<SourceMap | null>>();
  const mapOf = (url: string) => {
    if (!maps.has(url)) maps.set(url, load(url, release).catch(() => null));
    return maps.get(url)!;
  };
  const around = o.context ?? 3;
  return Promise.all(frames.map(async (f) => resolveFrame(f, await mapOf(f.url), around)));
}

/** The frame errors group by: the first app frame a map covers, as "file:function" (or "file:line" without a name). */
export function groupFrameOf(frames: readonly ResolvedFrame[]): string | null {
  const f = frames.find((x) => x.source !== null && x.inApp);
  if (!f) return null;
  const fn = f.fn?.replace(/^(async |new )/, "");
  return `${f.source}:${fn || f.line}`.slice(0, 300);
}
