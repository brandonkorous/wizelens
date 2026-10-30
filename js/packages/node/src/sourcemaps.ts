import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  cachedLoader,
  chainLoaders,
  decodeDataUrl,
  fetchMapLoader,
  isLoopbackUrl,
  type MapLoader,
  mapFileCandidates,
  mapUrlOf,
  MAX_SOURCEMAP_BYTES,
  parseSourceMap,
  type SourceMap,
} from "@wizeworks/lens-core/internal";

/** Where an add-on or the hub reads source maps from, with no upload. */
export interface SourceMapOptions {
  /** Build folders to read maps from, for example "./dist". */
  dirs?: string[];
  /** Fetch scripts and their maps from dev servers on this machine (localhost). Default true. */
  fetch?: boolean;
  /** More origins scripts may be fetched from, for example a dev domain: "https://app.local.test". */
  origins?: string[];
}

const inside = (dir: string, path: string) => path === dir || path.startsWith(dir + sep);

async function readSmall(path: string): Promise<string | null> {
  try {
    const s = await stat(path);
    return s.isFile() && s.size <= MAX_SOURCEMAP_BYTES ? await readFile(path, "utf8") : null;
  } catch {
    return null;
  }
}

// One file of a build folder: the map its sourceMappingURL names (Turbopack names maps apart from scripts), else its `.map`.
async function mapInDir(dir: string, file: string): Promise<SourceMap | null> {
  const path = resolve(dir, file);
  if (!inside(dir, path)) return null;
  const code = await readSmall(path);
  const ref = code ? mapUrlOf(code) : null;
  if (!ref) {
    const next = await readSmall(`${path}.map`);
    return next ? parseSourceMap(next) : null;
  }
  if (ref.startsWith("data:")) return parseSourceMap(decodeDataUrl(ref) ?? "");
  const mapPath = resolve(dirname(path), decodeURIComponent(ref.replace(/[?#].*$/, "")));
  const text = inside(dir, mapPath) ? await readSmall(mapPath) : null;
  return text ? parseSourceMap(text) : null;
}

/** Read maps from build folders: the script URL's path, or its tail, is looked up below each folder. */
export function dirMapLoader(dirs: readonly string[]): MapLoader {
  const roots = dirs.map((d) => resolve(d));
  return async (url) => {
    for (const dir of roots) {
      for (const file of mapFileCandidates(url)) {
        const map = await mapInDir(dir, file);
        if (map) return map;
      }
    }
    return null;
  };
}

const originOf = (url: string): string | null => {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch {
    return null;
  }
};

/** Build folders first, then dev servers on this machine and the origins named. Null when `options` is false. `extra` goes first (uploads). */
export function localMapLoader(options: SourceMapOptions | false | undefined, extra: MapLoader[] = []): MapLoader | null {
  if (options === false) return null;
  const loaders = [...extra];
  if (options?.dirs?.length) loaders.push(cachedLoader(dirMapLoader(options.dirs), { hitMs: 10_000, missMs: 10_000 }));
  if (options?.fetch !== false) {
    const origins = new Set((options?.origins ?? []).map(originOf).filter((o): o is string => !!o));
    const allow = (u: URL) => isLoopbackUrl(u) || origins.has(u.origin);
    loaders.push(cachedLoader(fetchMapLoader({ allow }), { hitMs: 10_000, missMs: 10_000 }));
  }
  return chainLoaders(...loaders);
}
