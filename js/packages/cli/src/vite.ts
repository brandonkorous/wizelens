import { resolve } from "node:path";
import { type PluginOptions, pluginRelease, RELEASE_GLOBAL, uploadAfterBuild } from "./plugin.js";

export type { PluginOptions } from "./plugin.js";

// The parts of Vite's types the plugin uses, so Vite is not a dependency.
interface UserConfig {
  root?: string;
  build?: { sourcemap?: boolean | "inline" | "hidden"; ssr?: unknown };
}
interface ResolvedConfig {
  root: string;
  command: "build" | "serve";
  build: { outDir: string; ssr?: unknown };
}
interface HtmlTag {
  tag: "script";
  children: string;
  injectTo: "head-prepend";
}
interface PluginContext {
  environment?: { name: string };
}

/** A Vite plugin: hidden source maps in builds, the release in the page, and the maps uploaded after `vite build`. */
export function wizelensSourceMaps(o: PluginOptions = {}) {
  let release: string | null = null;
  let outDir = "dist";
  let skip = false;
  let failed = false;
  return {
    name: "wizelens-sourcemaps",
    enforce: "post" as const,
    config(config: UserConfig, env: { command: string }) {
      release = pluginRelease(o, resolve(config.root ?? process.cwd()));
      const define = release ? { [RELEASE_GLOBAL]: JSON.stringify(release), "import.meta.env.WIZELENS_RELEASE": JSON.stringify(release) } : {};
      if (env.command !== "build") return { define };
      return { define, build: { sourcemap: config.build?.sourcemap || ("hidden" as const) } };
    },
    configResolved(c: ResolvedConfig) {
      outDir = resolve(c.root, c.build.outDir);
      skip = c.command !== "build" || !!c.build.ssr;
    },
    transformIndexHtml(): HtmlTag[] {
      return release ? [{ tag: "script", children: `${RELEASE_GLOBAL}=${JSON.stringify(release)};`, injectTo: "head-prepend" }] : [];
    },
    buildEnd(err?: Error) {
      if (err) failed = true;
    },
    async closeBundle(this: PluginContext | void) {
      const name = this && "environment" in this ? this.environment?.name : undefined;
      if (skip || failed || (name !== undefined && name !== "client")) return;
      await uploadAfterBuild(outDir, release, o);
    },
  };
}

export default wizelensSourceMaps;
