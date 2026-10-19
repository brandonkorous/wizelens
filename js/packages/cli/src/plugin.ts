// What the Vite, webpack, and Next.js plugins share: options, the release, and the upload after a build.
import { resolveRelease } from "./options.js";
import { type UploadOptions, uploadSourceMaps } from "./upload.js";

export interface PluginOptions extends Omit<UploadOptions, "dir"> {
  /** Upload the maps after a production build. Default true. False only turns maps on and sets the release. */
  upload?: boolean;
  /** Fail the build when the upload fails. Default false: a warning. */
  failOnError?: boolean;
}

/** The global the browser package reads the release from. */
export const RELEASE_GLOBAL = "globalThis.__WIZELENS_RELEASE__";

/** The release for a build in `root`, or null when none is found. */
export const pluginRelease = (o: PluginOptions, root: string): string | null => resolveRelease(o.release, root);

/** Upload a build folder's maps; a failure warns unless `failOnError`. */
export async function uploadAfterBuild(dir: string, release: string | null, o: PluginOptions, extra: Partial<UploadOptions> = {}): Promise<void> {
  if (o.upload === false) return;
  const warn = o.log ?? ((line: string) => console.warn(line));
  try {
    if (!release) throw new Error("No release found: set the release option or WIZELENS_RELEASE.");
    await uploadSourceMaps({ ...o, ...extra, dir, release });
  } catch (err) {
    const message = `[wizelens] Source maps were not uploaded: ${err instanceof Error ? err.message : String(err)}`;
    if (o.failOnError) throw new Error(message);
    warn(message);
  }
}
