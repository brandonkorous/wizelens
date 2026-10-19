import { readdir, readFile, rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { normalizeMapFile, SOURCEMAPS_PATH, type SourceMapEntry } from "@wizeworks/lens-core";
import { resolveRelease, resolveTarget, type Target, type TargetOptions } from "./options.js";

export interface UploadOptions extends TargetOptions {
  /** The build folder, for example "dist". */
  dir: string;
  /** The version the app sends as service.version. Default: WIZELENS_RELEASE, then the package.json version. */
  release?: string;
  /** Put before every file path, for example "_next/static/" when the folder is served there. Default none. */
  urlPrefix?: string;
  /** Delete each map after it uploads, so it is not deployed. Default false. */
  deleteAfterUpload?: boolean;
  /** Progress lines. Default console.info. */
  log?: (line: string) => void;
  fetch?: typeof fetch;
}

export interface UploadResult {
  release: string;
  files: string[];
  bytes: number;
}

const SKIP = new Set(["node_modules", ".git"]);
const PARALLEL = 4;

/** Every `.map` file below a folder, as absolute paths. */
export async function findSourceMaps(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await findSourceMaps(path)));
    else if (entry.isFile() && /\.[mc]?js\.map$/.test(entry.name)) out.push(path);
  }
  return out.sort();
}

/** The file key of a map: the generated file's path in the folder, with the URL prefix. */
export function fileKeyOf(dir: string, mapPath: string, urlPrefix = ""): string | null {
  const rel = relative(dir, mapPath).split(sep).join("/");
  return normalizeMapFile(`${urlPrefix.replace(/^\/+/, "")}${rel}`);
}

async function send(t: Target, f: typeof fetch, release: string, file: string, body: Buffer): Promise<void> {
  const q = new URLSearchParams({ release, file });
  if (t.project) q.set("project", t.project);
  const headers: Record<string, string> = { "Content-Type": "application/json", "Content-Encoding": "gzip" };
  if (t.token) headers.Authorization = `Bearer ${t.token}`;
  const res = await f(`${t.base}/${SOURCEMAPS_PATH}?${q}`, { method: "POST", headers, body: new Uint8Array(gzipSync(body)) });
  if (!res.ok) throw new Error(`${file}: ${res.status} ${await res.text().then((s) => s.slice(0, 300), () => "")}`);
}

/** Upload every source map of a build folder to a hub or the cloud, under one release. Throws on the first failure. */
export async function uploadSourceMaps(o: UploadOptions): Promise<UploadResult> {
  const release = resolveRelease(o.release, o.dir);
  if (!release) throw new Error("No release: pass --release, or set WIZELENS_RELEASE (the version your app sends as service.version).");
  const target = resolveTarget(o);
  const f = o.fetch ?? fetch;
  const log = o.log ?? ((line: string) => console.info(line));
  const maps = await findSourceMaps(o.dir);
  const files: string[] = [];
  let bytes = 0;
  for (let i = 0; i < maps.length; i += PARALLEL) {
    await Promise.all(
      maps.slice(i, i + PARALLEL).map(async (path) => {
        const file = fileKeyOf(o.dir, path, o.urlPrefix);
        if (!file) return;
        const body = await readFile(path);
        await send(target, f, release, file, body);
        if (o.deleteAfterUpload) await rm(path);
        files.push(file);
        bytes += body.length;
      }),
    );
  }
  log(`[wizelens] Uploaded ${files.length} source map${files.length === 1 ? "" : "s"} for release ${release} to ${target.base}`);
  return { release, files: files.sort(), bytes };
}

/** The maps a hub or the cloud holds, newest first; one release when given. */
export async function listUploadedMaps(o: TargetOptions & { release?: string; fetch?: typeof fetch }): Promise<SourceMapEntry[]> {
  const t = resolveTarget(o);
  const q = new URLSearchParams();
  if (o.release) q.set("release", o.release);
  if (t.project) q.set("project", t.project);
  const res = await (o.fetch ?? fetch)(`${t.base}/${SOURCEMAPS_PATH}?${q}`, { headers: t.token ? { Authorization: `Bearer ${t.token}` } : {} });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return ((await res.json()) as { maps: SourceMapEntry[] }).maps;
}
