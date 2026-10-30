import { parseArgs } from "node:util";
import type { UploadOptions } from "./upload.js";

export const USAGE = `wizelens: the WizeLens command line.

Usage:
  wizelens sourcemaps upload <dir> [options]   Upload a build folder's source maps.
  wizelens sourcemaps list [options]           List the maps a hub or the cloud holds.

Options:
  --release <version>  The version your app sends as service.version.
                       Default: WIZELENS_RELEASE, npm_package_version, then package.json.
  --endpoint <address> The hub or cloud. Default: WIZELENS_ENDPOINT,
                       then http://localhost:5960.
  --token <key>        Cloud ingest key (wl_ik_...) or hub token.
                       Default: WIZELENS_TOKEN.
  --project <name>     Hub only: the project. Default: WIZELENS_PROJECT.
  --url-prefix <path>  Put before every file, for example "_next/static/".
  --delete             Delete each map after it uploads.
  --help               Show this help.
`;

export type Command = { kind: "help" } | { kind: "upload"; options: UploadOptions } | { kind: "list"; options: Omit<UploadOptions, "dir"> };

/** The command a list of arguments asks for. Throws with a message when it is not valid. */
export function commandOf(argv: string[]): Command {
  const { values: a, positionals: p } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      release: { type: "string" },
      endpoint: { type: "string" },
      token: { type: "string" },
      project: { type: "string" },
      "url-prefix": { type: "string" },
      delete: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (a.help || p.length === 0) return { kind: "help" };
  const common = { release: a.release, endpoint: a.endpoint, token: a.token, project: a.project };
  if (p[0] !== "sourcemaps") throw new Error(`Unknown command "${p[0]}". Run wizelens --help.`);
  if (p[1] === "list") return { kind: "list", options: common };
  if (p[1] !== "upload") throw new Error(`Unknown sourcemaps command "${p[1] ?? ""}". Use upload or list.`);
  if (!p[2]) throw new Error("Name the build folder: wizelens sourcemaps upload ./dist");
  return { kind: "upload", options: { ...common, dir: p[2], urlPrefix: a["url-prefix"], deleteAfterUpload: !!a.delete } };
}
