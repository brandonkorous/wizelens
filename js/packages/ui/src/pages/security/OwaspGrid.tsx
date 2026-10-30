import { useState } from "react";
import type { SecurityCategory } from "@wizeworks/lens-core/internal";
import { fmtCount } from "../../format";
import { setQuery } from "../../routes";
import { Panel } from "../../ui/Panel";

/** The OWASP Top 10:2025, each with its risks, and the package check line. A click filters to one category; a second click clears it. */
export function OwaspGrid({ categories, selected, note }: { categories: SecurityCategory[]; selected: string | null; note: string | null }) {
  const [all, setAll] = useState(false);
  const quiet = categories.filter((c) => c.count === 0 && c.id !== selected).length;
  // A phone shows only the categories with risks, so the risk list is on the first screen (security.css).
  return (
    <Panel title="OWASP Top 10:2025">
      <div className={`wl-owasp-grid${all ? " wl-owasp-all" : ""}`}>
        {categories.map((c) => {
          const active = selected === c.id;
          const tone = c.high > 0 ? " wl-owasp-high" : c.count > 0 ? " wl-owasp-some" : active ? "" : " wl-owasp-none";
          return (
            <button key={c.id} type="button" className={`wl-owasp-tile${tone}${active ? " wl-active" : ""}`} aria-pressed={active} onClick={() => setQuery({ category: active ? null : c.id, key: null, page: null })}>
              <span className="wl-owasp">{c.id}</span>
              <span className="wl-owasp-name">{c.name}</span>
              <strong className="wl-owasp-count">{fmtCount(c.count)}</strong>
            </button>
          );
        })}
      </div>
      {quiet > 0 && (
        <button type="button" className="wl-btn wl-btn-sm wl-owasp-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? "Show only categories with risks" : `Show all ${categories.length} categories (${quiet} with none)`}
        </button>
      )}
      {note && <p className="wl-muted wl-small wl-scan-note">{note}</p>}
    </Panel>
  );
}
