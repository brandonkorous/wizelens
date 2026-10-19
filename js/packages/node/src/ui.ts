import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

const FALLBACK = `<!doctype html><html><head><meta charset="utf-8"><title>WizeLens</title></head>
<body style="font-family:system-ui;padding:2rem"><h1>WizeLens</h1>
<p>The dashboard build was not found. Run <code>pnpm build</code> in the WizeLens repo.</p>
<p>The API is still available at <a href="./api/traces">./api/traces</a>.</p></body></html>`;

/** Find the built dashboard (`@wizeworks/lens-ui/dist`). Returns null when it is not built. */
export function resolveUiDir(explicit?: string): string | null {
  if (explicit) return existsSync(explicit) ? explicit : null;
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve("@wizeworks/lens-ui/package.json");
    const dist = join(dirname(pkg), "dist");
    return existsSync(join(dist, "index.html")) ? dist : null;
  } catch {
    return null;
  }
}

/** Serve one UI file. `relPath` is the path below the base path, without a leading slash. */
export async function serveUi(uiDir: string | null, relPath: string, res: ServerResponse): Promise<void> {
  if (!uiDir) {
    res.writeHead(200, { "Content-Type": TYPES[".html"]! });
    res.end(FALLBACK);
    return;
  }
  const clean = normalize(decodeURIComponent(relPath || "index.html")).replace(/^([/\\])+/, "");
  let file = join(uiDir, clean);
  if (!file.startsWith(uiDir + sep) && file !== uiDir) {
    res.writeHead(400).end();
    return;
  }
  if (!existsSync(file) || extname(file) === "") file = join(uiDir, "index.html");
  try {
    const body = await readFile(file);
    // The page and its build id must always be fresh; the hashed files never change.
    const fresh = file.endsWith("index.html") || file.endsWith("version.json");
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": fresh ? "no-cache" : "public, max-age=31536000, immutable",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}
