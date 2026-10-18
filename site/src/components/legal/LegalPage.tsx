import { Article } from "@/components/docs/Article";
import { Toc } from "@/components/docs/Toc";
import { LEGAL_PAGES, loadLegal, type LegalSlug } from "@/lib/legal";

// One legal page: the other legal pages on the left, the text in the middle, and its outline on the right.
export async function LegalPage({ slug }: { slug: LegalSlug }) {
  const doc = await loadLegal(slug);
  return (
    <main className="wl-docs wl-legal">
      <div className="wl-docs-grid">
        <nav className="wl-legal-nav" aria-label="Legal">
          {LEGAL_PAGES.map((p) => (
            <a key={p.slug} href={`/${p.slug}/`} className={p.slug === slug ? "wl-on" : undefined} aria-current={p.slug === slug ? "page" : undefined}>{p.title}</a>
          ))}
        </nav>
        <article className="wl-docs-article">
          <header className="wl-docs-head">
            <h1>{doc.title}</h1>
            <p className="wl-docs-desc">{doc.description}</p>
            {doc.updated && <p className="wl-legal-date">Last updated {doc.updated}</p>}
          </header>
          <Article html={doc.html} />
        </article>
        <Toc headings={doc.headings} />
      </div>
    </main>
  );
}
