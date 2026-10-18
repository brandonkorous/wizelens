// Reads a Markdown file and its front matter (simple "key: value" lines between --- markers).
import { readFileSync } from "node:fs";

export function readMd(path) {
  const raw = readFileSync(path, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  const meta = {};
  for (const line of (m?.[1] ?? "").split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, body: m ? raw.slice(m[0].length) : raw };
}
