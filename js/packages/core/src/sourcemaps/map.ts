import { decodeMappings, type MapSegment } from "./vlq.js";

/** A parsed source map (v3). Mappings are decoded on the first lookup. */
export interface SourceMap {
  /** The generated file the map is for, when it says. */
  file: string | null;
  sources: string[];
  sourcesContent: (string | null)[];
  names: string[];
  mappings: string;
  /** Decoded mappings, per generated line. Filled on the first lookup. */
  lines?: MapSegment[][];
  /** Index maps: the parts and where each starts in the generated file (0-based). */
  sections?: { line: number; column: number; map: SourceMap }[];
}

/** Where a generated position comes from. Line and column are 1-based. */
export interface OriginalPosition {
  source: string;
  line: number;
  column: number;
  name: string | null;
  /** The whole original file, when the map carries it. */
  content: string | null;
}

type Json = Record<string, unknown>;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((s) => (typeof s === "string" ? s : "")) : []);

function withRoot(sources: string[], root: unknown): string[] {
  if (typeof root !== "string" || !root) return sources;
  const base = root.endsWith("/") ? root : `${root}/`;
  return sources.map((s) => (/^[a-z]+:/i.test(s) || s.startsWith("/") ? s : base + s));
}

function parseSections(raw: Json): SourceMap | null {
  const sections = (raw.sections as unknown[]).flatMap((s) => {
    const sec = s as { offset?: { line?: number; column?: number }; map?: unknown };
    const map = sec?.map ? parseSourceMap(sec.map as Json) : null;
    return map ? [{ line: Number(sec.offset?.line) || 0, column: Number(sec.offset?.column) || 0, map }] : [];
  });
  return { file: typeof raw.file === "string" ? raw.file : null, sources: [], sourcesContent: [], names: [], mappings: "", sections };
}

/** Parse a source map from its JSON text or object. Null when it is not a v3 source map. */
export function parseSourceMap(input: string | Json): SourceMap | null {
  let raw: Json;
  try {
    raw = typeof input === "string" ? (JSON.parse(input.replace(/^\)\]\}'[^\n]*\n/, "")) as Json) : input;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Number(raw.version) !== 3) return null;
  if (Array.isArray(raw.sections)) return parseSections(raw);
  if (typeof raw.mappings !== "string") return null;
  const content = Array.isArray(raw.sourcesContent) ? raw.sourcesContent.map((c) => (typeof c === "string" ? c : null)) : [];
  return {
    file: typeof raw.file === "string" ? raw.file : null,
    sources: withRoot(strings(raw.sources), raw.sourceRoot),
    sourcesContent: content,
    names: strings(raw.names),
    mappings: raw.mappings,
  };
}

// The last segment at or before the column: the code at that column came from it.
function segmentAt(line: readonly MapSegment[], column: number): MapSegment | null {
  let lo = 0;
  let hi = line.length - 1;
  let found: MapSegment | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (line[mid]![0]! <= column) {
      found = line[mid]!;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function lookupSection(map: SourceMap, line0: number, col0: number): OriginalPosition | null {
  const sections = map.sections!;
  let pick: (typeof sections)[number] | undefined;
  for (const s of sections) if (s.line < line0 || (s.line === line0 && s.column <= col0)) pick = s;
  if (!pick) return null;
  return lookup0(pick.map, line0 - pick.line, line0 === pick.line ? col0 - pick.column : col0);
}

function lookup0(map: SourceMap, line0: number, col0: number): OriginalPosition | null {
  if (map.sections) return lookupSection(map, line0, col0);
  map.lines ??= decodeMappings(map.mappings);
  const seg = segmentAt(map.lines[line0] ?? [], col0);
  if (!seg || seg.length < 4) return null;
  const source = map.sources[seg[1]!];
  if (source === undefined) return null;
  return {
    source,
    line: seg[2]! + 1,
    column: seg[3]! + 1,
    name: seg.length > 4 ? (map.names[seg[4]!] ?? null) : null,
    content: map.sourcesContent[seg[1]!] ?? null,
  };
}

/** The original position of a generated line and column (both 1-based, as in stack traces). Null when the map has no mapping there. */
export function originalPosition(map: SourceMap, line: number, column: number): OriginalPosition | null {
  if (line < 1 || column < 1) return null;
  try {
    return lookup0(map, line - 1, column - 1);
  } catch {
    return null;
  }
}
