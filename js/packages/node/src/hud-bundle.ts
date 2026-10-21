import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { createRequire } from "node:module";

const BUNDLE = "@wizeworks/lens-browser/wizelens.iife.js";

/** The paths below the base path that serve the script bundle and its source map. */
export const HUD_SCRIPT = "wizelens.js";
export const HUD_SCRIPT_MAP = "wizelens.js.map";

/** The lens-browser script-tag bundle on disk, or null when it is not installed or not built. */
export function resolveHudBundle(): string | null {
  try {
    const file = createRequire(import.meta.url).resolve(BUNDLE);
    return existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

/** The tag the add-on puts before `</body>`, exactly as docs/HUD-PLAN.md has it. */
export const hudTag = (basePath: string): string =>
  `<script src="${basePath}/${HUD_SCRIPT}" data-endpoint="${basePath}" data-hud="true" data-source="inject" defer></script>`;

let warned = false;

/** The script tag to inject, or null when the HUD is off or the bundle is missing (then one warning per process says so). */
export function hudTagFor(on: boolean, bundle: string | null, basePath: string, warn: (line: string) => void = console.warn): string | null {
  if (!on) return null;
  if (bundle) return hudTag(basePath);
  if (warned) return null;
  warned = true;
  warn(`[wizelens] The HUD is on, but ${BUNDLE} was not found, so pages get no HUD. Install or build @wizeworks/lens-browser.`);
  return null;
}

/** True for the bundle and map paths below the base path. */
export const isHudScript = (sub: string): boolean => sub === HUD_SCRIPT || sub === HUD_SCRIPT_MAP;

const MAP_COMMENT = /\/\/# sourceMappingURL=\S+\s*$/;

/** The bundle names its map by the built file name; served as wizelens.js, its map is wizelens.js.map. */
async function readScript(bundle: string, map: boolean): Promise<Buffer> {
  if (map) return readFile(`${bundle}.map`);
  const text = await readFile(bundle, "utf8");
  return Buffer.from(text.replace(MAP_COMMENT, `//# sourceMappingURL=${HUD_SCRIPT_MAP}\n`));
}

/** Serve the bundle or its map, always fresh, so a rebuilt bundle shows at the next page load. */
export async function serveHudScript(bundle: string | null, sub: string, method: string, res: ServerResponse): Promise<void> {
  const map = sub === HUD_SCRIPT_MAP;
  try {
    if (!bundle) throw new Error("no bundle");
    const body = await readScript(bundle, map);
    res.writeHead(200, {
      "Content-Type": map ? "application/json; charset=utf-8" : "application/javascript; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-cache",
    });
    res.end(method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
  }
}
