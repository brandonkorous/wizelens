import { loadAllDocs } from "@/lib/docs/content";
import { docHref } from "@/lib/docs/nav";

export const dynamic = "force-static";

// The docs search index: one entry per section of every page, written once at build time.
export async function GET() {
  const docs = await loadAllDocs();
  const entries = docs.flatMap((d) =>
    d.sections
      .filter((s) => s.title || s.text)
      .map((s) => ({ href: `${docHref(d.slug)}${s.id ? `#${s.id}` : ""}`, page: d.title, title: s.title, text: s.text })),
  );
  return Response.json(entries);
}
