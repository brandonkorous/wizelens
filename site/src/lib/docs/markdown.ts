import rehypeShiki from "@shikijs/rehype";
import type { BundledLanguage } from "shiki";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { rehypeHeadings, rehypeLinks, rehypeSections, rehypeTables, type Heading, type Section } from "./plugins";

export type Rendered = { html: string; headings: Heading[]; sections: Section[] };

const LANGS: BundledLanguage[] = ["csharp", "ts", "tsx", "js", "bash", "json", "xml", "yaml", "sql", "http", "ini"];

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypeLinks)
  .use(rehypeTables)
  .use(rehypeSections)
  .use(rehypeHeadings)
  .use(rehypeShiki, { theme: "github-dark-default", langs: LANGS, defaultLanguage: "text", fallbackLanguage: "text" })
  .use(rehypeStringify);

// Markdown in, page HTML out, with the outline and search sections on the side.
export async function renderMarkdown(source: string): Promise<Rendered> {
  const file = await processor.process(source);
  return { html: String(file), headings: file.data.headings ?? [], sections: file.data.sections ?? [] };
}
