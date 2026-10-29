import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderMarkdown } from "./docs/markdown";

export type Release = { id: string; version: string; title: string; html: string; sections: string[] };

const SOURCE = join(process.cwd(), "..", "CHANGELOG.md");

function parseHeading(line: string): { version: string; title: string } {
  const match = /^## \[([^\]]+)\]\s*(?:[—-]\s*(.*))?$/.exec(line.trim());
  return { version: match?.[1] ?? line.replace(/^##\s*/, ""), title: match?.[2] ?? "" };
}

function idOf(version: string): string {
  return version.toLowerCase() === "unreleased" ? "unreleased" : `v${version.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

// The newest released version ("0.3.0-alpha.14"), for pages that name the current release.
export async function latestVersion(): Promise<string | null> {
  const raw = await readFile(SOURCE, "utf8");
  for (const m of raw.matchAll(/^## \[([^\]]+)\]/gm)) if (m[1]!.toLowerCase() !== "unreleased") return m[1]!;
  return null;
}

// Reads CHANGELOG.md from the repo and splits it into one entry per release, newest first; groups stay h3.
export async function loadReleases(): Promise<Release[]> {
  const raw = await readFile(SOURCE, "utf8");
  const parts = raw.split(/\r?\n(?=## \[)/).slice(1);
  return Promise.all(
    parts.map(async (part) => {
      const [first = "", ...rest] = part.split(/\r?\n/);
      const { version, title } = parseHeading(first);
      const body = rest.join("\n");
      const rendered = await renderMarkdown(body);
      const id = idOf(version);
      const html = rendered.html.replace(/ id="/g, ` id="${id}-`).replace(/ href="#/g, ` href="#${id}-`);
      return { id, version, title, html, sections: [...new Set(rendered.headings.filter((h) => h.depth === 3).map((h) => h.text))] };
    }),
  );
}
