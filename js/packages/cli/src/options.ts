import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENDPOINT_ENV, HUB_DEFAULT_PORT, PROJECT_ENV, TOKEN_ENV } from "@wizeworks/lens-core";

/** Where maps go and who sends them. Everything has an environment variable, so CI needs no flags. */
export interface TargetOptions {
  /** The hub or cloud address, for example "https://app.wizelens.com". Default: WIZELENS_ENDPOINT, then the local hub. */
  endpoint?: string;
  /** The cloud ingest key (wl_ik_...) or the hub token. Default: WIZELENS_TOKEN. */
  token?: string;
  /** Hub only: the project the maps belong to. Default: WIZELENS_PROJECT. The cloud takes the project from the key. */
  project?: string;
}

export interface Target {
  /** The WizeLens base, ending in "/_wizelens". */
  base: string;
  token: string | undefined;
  project: string | undefined;
}

/** The WizeLens base URL: the address with "/_wizelens" added when it is not there. */
export function baseOf(url: string): string {
  const clean = url.trim().replace(/\/+$/, "");
  return clean.endsWith("/_wizelens") ? clean : `${clean}/_wizelens`;
}

export function resolveTarget(o: TargetOptions, env: NodeJS.ProcessEnv = process.env): Target {
  const url = o.endpoint ?? env[ENDPOINT_ENV] ?? `http://localhost:${HUB_DEFAULT_PORT}`;
  return { base: baseOf(url), token: o.token ?? env[TOKEN_ENV] ?? undefined, project: o.project ?? env[PROJECT_ENV] ?? undefined };
}

function packageVersion(dir: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version?: unknown };
    return typeof pkg.version === "string" && pkg.version ? pkg.version : null;
  } catch {
    return null;
  }
}

/** The release maps are stored under: given, WIZELENS_RELEASE, npm's package version, or the package.json in `dir`. */
export function resolveRelease(given: string | undefined, dir = process.cwd(), env: NodeJS.ProcessEnv = process.env): string | null {
  return given || env.WIZELENS_RELEASE || env.npm_package_version || packageVersion(dir);
}
