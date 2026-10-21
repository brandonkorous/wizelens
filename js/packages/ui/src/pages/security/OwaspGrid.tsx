import type { SecurityCategory } from "@wizeworks/lens-core";
import { fmtCount } from "../../format";
import { setQuery } from "../../routes";
import { Panel } from "../../ui/Panel";

/** The OWASP Top 10:2025, each with its risks, and the package check line. A click filters to one category; a second click clears it. */
export function OwaspGrid({ categories, selected, note }: { categories: SecurityCategory[]; selected: string | null; note: string | null }) {
  return (
    <Panel title="OWASP Top 10:2025">
      <div className="wl-owasp-grid">
        {categories.map((c) => {
          const active = selected === c.id;
          const tone = c.high > 0 ? " wl-owasp-high" : c.count > 0 ? " wl-owasp-some" : "";
          return (
            <button key={c.id} type="button" className={`wl-owasp-tile${tone}${active ? " wl-active" : ""}`} aria-pressed={active} onClick={() => setQuery({ category: active ? null : c.id, key: null })}>
              <span className="wl-owasp">{c.id}</span>
              <span className="wl-owasp-name">{c.name}</span>
              <strong className="wl-owasp-count">{fmtCount(c.count)}</strong>
            </button>
          );
        })}
      </div>
      {note && <p className="wl-muted wl-small wl-scan-note">{note}</p>}
    </Panel>
  );
}
