import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { type PluginOptions, pluginRelease, RELEASE_GLOBAL, uploadAfterBuild } from "./plugin.js";
import { WizeLensSourceMapsPlugin } from "./webpack.js";

export type { PluginOptions } from "./plugin.js";

// The parts of Next.js's config the wrapper uses, so Next.js is not a dependency.
type WebpackFn = (config: { plugins?: unknown[] }, ctx: { isServer: boolean; dev: boolean; dir?: string }) => unknown;
export interface NextConfigLike {
  productionBrowserSourceMaps?: boolean;
  distDir?: string;
  env?: Record<string, string | undefined>;
  webpack?: WebpackFn;
  compiler?: {
    define?: Record<string, string>;
    runAfterProductionCompile?: (ctx: { distDir: string; projectDir: string }) => Promise<void>;
  } & Record<string, unknown>;
  [key: string]: unknown;
}

/** Next.js 15.4 and later run `compiler.runAfterProductionCompile` for webpack and Turbopack builds alike. */
export function hasAfterCompileHook(dir = process.cwd()): boolean {
  try {
    const pkg = createRequire(join(dir, "package.json"))("next/package.json") as { version: string };
    const [major = 0, minor = 0] = pkg.version.split(".").map(Number);
    return major > 15 || (major === 15 && minor >= 4);
  } catch {
    return true;
  }
}

// Maps are served below /_next/static; when this wrapper turned them on, they are deleted after upload so they are not deployed.
function uploadExtra(config: NextConfigLike) {
  return { urlPrefix: "_next/static/", deleteAfterUpload: config.productionBrowserSourceMaps === undefined };
}

function withWebpackUpload(config: NextConfigLike, o: PluginOptions): WebpackFn {
  const inner = config.webpack;
  return (wp, ctx) => {
    const out = (inner ? inner(wp, ctx) : wp) as { plugins?: unknown[] };
    if (!ctx.isServer && !ctx.dev) (out.plugins ??= []).push(new WizeLensSourceMapsPlugin({ ...o, release: o.release ?? pluginRelease(o, ctx.dir ?? process.cwd()) ?? undefined }, uploadExtra(config)));
    return out;
  };
}

/** Wrap a Next.js config: browser source maps on, the release in the bundle, and the maps uploaded after `next build`. */
export function withWizeLens<T extends NextConfigLike>(config: T, o: PluginOptions = {}): T {
  const release = pluginRelease(o, process.cwd());
  const extra = uploadExtra(config);
  const prev = config.compiler?.runAfterProductionCompile;
  const define = release ? { [RELEASE_GLOBAL]: JSON.stringify(release) } : {};
  const next: NextConfigLike = {
    ...config,
    productionBrowserSourceMaps: config.productionBrowserSourceMaps ?? true,
    env: { ...config.env, ...(release ? { NEXT_PUBLIC_WIZELENS_RELEASE: release } : {}) },
    compiler: { ...config.compiler, define: { ...define, ...config.compiler?.define } },
  };
  if (!hasAfterCompileHook()) return { ...next, webpack: withWebpackUpload(config, { ...o, release: release ?? undefined }) } as T;
  next.compiler!.runAfterProductionCompile = async (ctx) => {
    await prev?.(ctx);
    await uploadAfterBuild(join(resolve(ctx.projectDir, ctx.distDir), "static"), release, o, extra);
  };
  return next as T;
}

export default withWizeLens;
