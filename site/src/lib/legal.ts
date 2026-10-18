import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { frontmatter } from "./docs/content";
import { renderMarkdown, type Rendered } from "./docs/markdown";

export type LegalSlug = "privacy" | "terms" | "security" | "license";
export type LegalDoc = Rendered & { title: string; description: string; updated: string };

export const LEGAL_PAGES: { slug: LegalSlug; title: string }[] = [
  { slug: "privacy", title: "Privacy" },
  { slug: "terms", title: "Terms of use" },
  { slug: "security", title: "Security" },
  { slug: "license", title: "License" },
];

const SITE = process.cwd();

// The license page ends with the LICENSE file itself, read from the repo so the two never differ.
async function withLicense(slug: LegalSlug, body: string): Promise<string> {
  if (slug !== "license") return body;
  const text = await readFile(join(SITE, "..", "LICENSE"), "utf8");
  return `${body}\n\n\`\`\`\n${text.trim()}\n\`\`\`\n`;
}

export async function loadLegal(slug: LegalSlug): Promise<LegalDoc> {
  const raw = await readFile(join(SITE, "content", "legal", `${slug}.md`), "utf8");
  const { meta, body } = frontmatter(raw);
  const rendered = await renderMarkdown(await withLicense(slug, body));
  return { ...rendered, title: meta.title ?? slug, description: meta.description ?? "", updated: meta.updated ?? "" };
}
