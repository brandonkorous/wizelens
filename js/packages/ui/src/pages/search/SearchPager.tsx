// Search pages come by cursor, so the pager steps back and forth and counts only the pages loaded so far.
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtCount } from "../../format";
import type { SearchState } from "../../data/search";

/** Which loaded page is shown; back to the first when the search changes. */
export function useSearchPage(key: string, s: SearchState) {
  const [view, setView] = useState({ key, at: 0 });
  const at = view.key === key ? Math.min(view.at, Math.max(0, s.pages.length - 1)) : 0;
  const go = (next: number) => {
    if (next >= s.pages.length) s.more?.();
    setView({ key, at: next });
  };
  return { at, go };
}

interface SearchPagerProps {
  s: SearchState;
  at: number;
  /** Rows per page the search asks for. */
  size: number;
  /** Results counted so far (the summary's count, else the rows loaded), and if there are more. */
  total: { n: number; more: boolean };
  noun: string;
  onPage: (at: number) => void;
}

/** "51–100 of 230+ requests", Previous, the loaded pages, and Next. */
export function SearchPager({ s, at, size, total, noun, onPage }: SearchPagerProps) {
  const loaded = s.pages.length;
  if (loaded <= 1 && !s.more) return null;
  const from = at * size + 1;
  const to = from + (s.pages[at]?.items.length ?? 0) - 1;
  const canNext = at + 1 < loaded || !!s.more;
  return (
    <div className="wl-pager">
      <span>
        {fmtCount(from)}–{fmtCount(Math.max(from, to))} of {fmtCount(total.n)}{total.more ? "+" : ""} {noun}
      </span>
      <div className="wl-pages">
        <button type="button" aria-label="Previous page" disabled={at <= 0} onClick={() => onPage(at - 1)}>
          <ChevronLeft size={16} />
        </button>
        {s.pages.map((_, i) => (
          <button key={i} type="button" className={i === at ? "wl-active" : undefined} onClick={() => onPage(i)}>
            {fmtCount(i + 1)}
          </button>
        ))}
        <button type="button" aria-label="Next page" disabled={!canNext || s.loading} onClick={() => onPage(at + 1)}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
