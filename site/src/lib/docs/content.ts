import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderMarkdown, type Rendered } from "./markdown";
import { DOC_LIST } from "./nav";

export type Doc = Rendered & { slug: string; title: string; description: string };

const SITE = process.cwd();
const CONTENT = join(SITE, "content", "docs");

// Pages read straight from the repo, so the site never drifts from the source.
const REPO_SOURCES: Record<string, { path: string; description: string }> = {
  contract: {
    path: join(SITE, "..", "docs", "CONTRACT.md"),
    description: "The wire format every WizeLens add-on, the hub, and the cloud follow: headers, endpoints, types, storage, and rules.",
  },
};

export function frontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { meta, body: raw.slice(match[0].length) };
}

function dropTitle(body: string): string {
  return body.replace(/^\s*# .*\r?\n/, "");
}

export async function loadDoc(slug: string): Promise<Doc | null> {
  const entry = DOC_LIST.find((d) => d.slug === slug);
  if (!entry) return null;
  const repo = REPO_SOURCES[slug];
  const raw = await readFile(repo?.path ?? join(CONTENT, `${slug || "index"}.md`), "utf8");
  const { meta, body } = frontmatter(raw);
  const rendered = await renderMarkdown(dropTitle(body));
  return {
    ...rendered,
    slug,
    title: meta.title ?? entry.title,
    description: meta.description ?? repo?.description ?? "",
  };
}

export async function loadAllDocs(): Promise<Doc[]> {
  const docs = await Promise.all(DOC_LIST.map((d) => loadDoc(d.slug)));
  return docs.filter((d): d is Doc => d !== null);
}
