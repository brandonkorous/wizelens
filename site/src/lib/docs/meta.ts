import type { Metadata } from "next";
import { breadcrumbs, graph, techArticle } from "@/lib/schema";
import { pageMeta } from "@/lib/seo";
import { loadDoc } from "./content";
import { DOC_GROUPS, docHref } from "./nav";

function groupOf(slug: string): string {
  return DOC_GROUPS.find((g) => g.items.some((d) => d.slug === slug))?.title ?? "Docs";
}

// Metadata for one docs page: its own title, canonical address, and share image.
export async function docMetadata(slug: string): Promise<Metadata> {
  const doc = await loadDoc(slug);
  const title = slug ? `${doc?.title} · WizeLens Docs` : "WizeLens Docs: request tracing for .NET, Node, Java, Python, and Go";
  const meta = pageMeta({
    path: docHref(slug),
    title,
    absolute: true,
    description: doc?.description ?? "",
    image: slug ? `docs-${slug}` : "docs",
    imageAlt: `${doc?.title ?? "Docs"}: ${doc?.description ?? ""}`,
    type: "article",
  });
  return { ...meta, alternates: { ...meta.alternates, types: { "text/markdown": `/docs/${slug || "index"}.md` } } };
}

// Structured data for one docs page: the article and where it sits in the docs.
export async function docSchema(slug: string): Promise<string> {
  const doc = await loadDoc(slug);
  const path = docHref(slug);
  const crumbs = [{ name: "WizeLens", path: "/" }, { name: "Docs", path: "/docs/" }];
  if (slug) crumbs.push({ name: doc?.title ?? slug, path });
  return graph(techArticle({ title: doc?.title ?? "Docs", description: doc?.description ?? "", path, section: groupOf(slug) }), breadcrumbs(crumbs));
}
