import { open, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { mapUrlOf, normalizeMapFile } from "@wizeworks/lens-core/internal";

/** One map to upload: where it is on disk, and the served path of the script it belongs to. */
export interface MapFile {
  map: string;
  file: string;
}

const SKIP = new Set(["node_modules", ".git"]);
const SCRIPT = /\.[mc]?js$/;
const MAP = /\.[mc]?js\.map$/;

async function walk(dir: string, out: string[]): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

// The last 4 KB of a script: where its sourceMappingURL comment is.
async function tailOf(path: string): Promise<string> {
  const fh = await open(path, "r");
  try {
    const { size } = await fh.stat();
    const length = Math.min(size, 4096);
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, size - length);
    return buf.toString("utf8");
  } finally {
    await fh.close();
  }
}

/** The file key of a path in the folder, with the URL prefix. */
export function fileKeyOf(dir: string, path: string, urlPrefix = ""): string | null {
  const rel = relative(dir, path).split(sep).join("/");
  return normalizeMapFile(`${urlPrefix.replace(/^\/+/, "")}${rel}`);
}

// Map path -> the script that names it. Turbopack and some webpack setups give a map another name than its script.
async function namedBy(scripts: string[], maps: Set<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const script of scripts) {
    const ref = mapUrlOf(await tailOf(script));
    if (!ref || ref.startsWith("data:") || /^[a-z]+:/i.test(ref)) continue;
    const map = resolve(dirname(script), decodeURIComponent(ref.replace(/[?#].*$/, "")));
    if (maps.has(map)) out.set(map, script);
  }
  return out;
}

/** Every JavaScript map below a folder, each keyed by its script: the one that names it, else the map's own name without ".map". */
export async function findSourceMaps(dir: string, urlPrefix = ""): Promise<MapFile[]> {
  const files = (await walk(resolve(dir), [])).sort();
  const maps = new Set(files.filter((f) => MAP.test(f)));
  const owners = await namedBy(files.filter((f) => SCRIPT.test(f)), maps);
  return [...maps].flatMap((map) => {
    const file = fileKeyOf(resolve(dir), owners.get(map) ?? map, urlPrefix);
    return file ? [{ map, file }] : [];
  });
}
