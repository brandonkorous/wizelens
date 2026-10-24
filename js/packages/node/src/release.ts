// The app's release: an option, a release or commit variable a host sets, else the version in the app's own package.json.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { WizeLensOptions } from "./types.js";

/** Checked in order: WizeLens and OpenTelemetry first, then the commit that hosts and CI set, then npm scripts' version. */
export const RELEASE_ENV = ["WIZELENS_RELEASE", "OTEL_SERVICE_VERSION", "SOURCE_VERSION", "GIT_SHA", "GIT_COMMIT", "VERCEL_GIT_COMMIT_SHA", "RENDER_GIT_COMMIT", "npm_package_version"] as const;

const MAX = 50;

/** A folder outside node_modules: a script run from a package's bin reads the app's package.json, not the package's. */
const appDir = (path: string): string => {
  const at = path.replace(/\\/g, "/").indexOf("/node_modules/");
  return at >= 0 ? path.slice(0, at) : path;
};

/** The version in the nearest package.json at or above `dir`, or undefined. */
export function packageVersionAt(dir: string): string | undefined {
  for (let d = resolve(appDir(dir)), i = 0; i < 20; d = dirname(d), i++) {
    try {
      const v = (JSON.parse(readFileSync(join(d, "package.json"), "utf8")) as { version?: unknown }).version;
      return typeof v === "string" && v.trim() ? v : undefined;
    } catch {
      // No package.json here (or not JSON): look one folder up.
    }
    if (dirname(d) === d) break;
  }
  return undefined;
}

let fromPackage: { value: string | undefined } | null = null;

/** The version of the script that started the process, else of the working folder; read once. */
function packageRelease(): string | undefined {
  fromPackage ??= { value: (process.argv[1] ? packageVersionAt(dirname(process.argv[1])) : undefined) ?? packageVersionAt(process.cwd()) };
  return fromPackage.value;
}

/** The app's version, kept on every span as `service.version`. Undefined when nothing names one. */
export function releaseOf(o: Pick<WizeLensOptions, "release">): string | undefined {
  const env = RELEASE_ENV.map((k) => process.env[k]?.trim()).find(Boolean);
  return (o.release?.trim() || env || packageRelease())?.slice(0, MAX) || undefined;
}

/** Forget the package.json version read before (tests). */
export const resetReleaseCache = (): void => void (fromPackage = null);
