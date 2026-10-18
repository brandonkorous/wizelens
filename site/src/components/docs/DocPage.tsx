import { notFound } from "next/navigation";
import { ArrowRight } from "@/components/ui/icons";
import { loadDoc } from "@/lib/docs/content";
import { docHref, neighbors } from "@/lib/docs/nav";
import { Article } from "./Article";
import { Toc } from "./Toc";

function PrevNext({ slug }: { slug: string }) {
  const { prev, next } = neighbors(slug);
  return (
    <nav className="wl-docs-pager" aria-label="More docs">
      {prev ? (
        <a href={docHref(prev.slug)} className="wl-docs-prev"><span>Back</span><b>{prev.title}</b></a>
      ) : <span />}
      {next && (
        <a href={docHref(next.slug)} className="wl-docs-next"><span>Next</span><b>{next.title} <ArrowRight /></b></a>
      )}
    </nav>
  );
}

// One docs page: title, the rendered Markdown, back and next, and the outline on the right.
export async function DocPage({ slug }: { slug: string }) {
  const doc = await loadDoc(slug);
  if (!doc) notFound();
  return (
    <>
      <article className="wl-docs-article">
        <header className="wl-docs-head">
          <h1>{doc.title}</h1>
          {doc.description && <p className="wl-docs-desc">{doc.description}</p>}
        </header>
        <Article html={doc.html} />
        <PrevNext slug={slug} />
      </article>
      <Toc headings={doc.headings} />
    </>
  );
}
