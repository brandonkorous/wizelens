// The source map API every host shares (docs/CONTRACT.md, "Source maps").
import { type MapLoader, resolveStack } from "./resolve.js";
import { pathSuffixes, scriptPath } from "./stack.js";

/** `POST` uploads one map (`?release=&file=`, body: the map JSON, gzip allowed); `GET` lists a release's maps. */
export const SOURCEMAPS_PATH = "api/sourcemaps";
/** `POST {stack, release}` answers `{frames}`: the stack after source maps, with a few lines of source per frame. */
export const SOURCEMAPS_RESOLVE_PATH = "api/sourcemaps/resolve";
/** Largest map one upload may hold, after unzip. */
export const MAX_SOURCEMAP_BYTES = 64 * 1024 * 1024;
/** Longest stack the resolve API reads. */
export const MAX_RESOLVE_STACK = 64 * 1024;
/** Releases kept per project; older ones are dropped when a new release uploads. */
export const SOURCEMAP_RELEASES_KEPT = 20;

/** One stored map, as the list API shows it. */
export interface SourceMapEntry {
  release: string;
  /** The generated file's path, for example "assets/index-abc.js". */
  file: string;
  bytes: number;
  uploadedMs: number;
}

/** A map's file key: no origin, "~/", query, or leading slash. Null when it is empty or climbs with "..". */
export function normalizeMapFile(file: string): string | null {
  const path = scriptPath(file.replace(/^~\//, "/")).replace(/\.map$/, "");
  if (!path || path.length > 500 || path.split("/").includes("..")) return null;
  return path;
}

/** A release name: 1 to 100 printable characters. Null when it is not valid. */
export function normalizeRelease(release: unknown): string | null {
  if (typeof release !== "string") return null;
  const r = release.trim();
  return r && r.length <= 100 && !/[\u0000-\u001f]/.test(r) ? r : null;
}

/** The file keys a script URL can match, longest first: a map uploaded for "assets/a.js" serves "https://x/app/assets/a.js". */
export const mapFileCandidates = (url: string): string[] => pathSuffixes(scriptPath(url)).slice(0, 12);

/** Check an upload's query. A string is the problem to answer with 400. */
export function checkUpload(params: URLSearchParams): { release: string; file: string } | string {
  const release = normalizeRelease(params.get("release"));
  if (!release) return "Add ?release=<version>: the version your app sends as service.version.";
  const file = normalizeMapFile(params.get("file") ?? "");
  if (!file) return "Add ?file=<path of the minified file>, for example assets/index-abc.js.";
  return { release, file };
}

/** Answer a resolve call: 400 without a stack, else the frames with source context. */
export async function answerResolve(body: unknown, load: MapLoader): Promise<{ status: number; body: unknown }> {
  const q = checkResolve(body);
  if (!q) return { status: 400, body: { error: "Send {stack, release}: the raw stack and the app version." } };
  return { status: 200, body: { frames: await resolveStack(q.stack, q.release, load) } };
}

/** Check a resolve body. Null when it has no stack. */
export function checkResolve(body: unknown): { stack: string; release: string | null } | null {
  const b = body as { stack?: unknown; release?: unknown } | null;
  if (!b || typeof b.stack !== "string" || !b.stack) return null;
  return { stack: b.stack.slice(0, MAX_RESOLVE_STACK), release: normalizeRelease(b.release) };
}
