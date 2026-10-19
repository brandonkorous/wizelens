import { type PluginOptions, pluginRelease, RELEASE_GLOBAL, uploadAfterBuild } from "./plugin.js";
import type { UploadOptions } from "./upload.js";

export type { PluginOptions } from "./plugin.js";

// The parts of webpack's types the plugin uses, so webpack is not a dependency.
interface Compilation {
  errors: unknown[];
  outputOptions: { path?: string };
}
interface Compiler {
  context: string;
  options: { mode?: string; devtool?: unknown; output: { path?: string } };
  webpack?: { DefinePlugin: new (defs: Record<string, string>) => { apply(compiler: Compiler): void } };
  hooks: { afterEmit: { tapPromise(name: string, fn: (compilation: Compilation) => Promise<void>): void } };
}

const NAME = "WizeLensSourceMapsPlugin";

/** A webpack 5 plugin: hidden source maps in production, the release in the bundle, and the maps uploaded after emit. */
export class WizeLensSourceMapsPlugin {
  readonly #o: PluginOptions;
  readonly #extra: Partial<UploadOptions>;

  /** `extra` is for wrappers (Next.js): a URL prefix, or deleting maps after upload. */
  constructor(options: PluginOptions = {}, extra: Partial<UploadOptions> = {}) {
    this.#o = options;
    this.#extra = extra;
  }

  apply(compiler: Compiler): void {
    const production = compiler.options.mode === "production";
    if (production && !compiler.options.devtool) compiler.options.devtool = "hidden-source-map";
    const release = pluginRelease(this.#o, compiler.context);
    if (release && compiler.webpack) new compiler.webpack.DefinePlugin({ [RELEASE_GLOBAL]: JSON.stringify(release), "process.env.WIZELENS_RELEASE": JSON.stringify(release) }).apply(compiler);
    if (!production) return;
    compiler.hooks.afterEmit.tapPromise(NAME, async (compilation) => {
      const dir = compilation.outputOptions.path ?? compiler.options.output.path;
      if (compilation.errors.length === 0 && dir) await uploadAfterBuild(dir, release, this.#o, this.#extra);
    });
  }
}

export default WizeLensSourceMapsPlugin;
