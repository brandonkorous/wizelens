"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { loadIndex, search, snippet, type SearchEntry } from "./searchIndex";

function useHotkey(open: () => void) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); open(); }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); open(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

function Results({ hits, query, active, onPick }: { hits: SearchEntry[]; query: string; active: number; onPick: (i: number) => void }) {
  if (!query) return <p className="wl-search-empty">Search every page of the docs.</p>;
  if (hits.length === 0) return <p className="wl-search-empty">Nothing found for “{query}”.</p>;
  return (
    <ul className="wl-search-list" role="listbox">
      {hits.map((h, i) => (
        <li key={h.href} role="option" aria-selected={i === active}>
          <a href={h.href} className={i === active ? "wl-on" : undefined} onMouseEnter={() => onPick(i)}>
            <span className="wl-search-page">{h.page}</span>
            <b>{h.title || h.page}</b>
            <span className="wl-search-text">{snippet(h.text, query)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// Ctrl K (or /) opens a search over every docs page, built at build time.
export function DocsSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchEntry[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = search(index, query);
  const show = useCallback(() => { setOpen(true); loadIndex().then(setIndex); }, []);
  useHotkey(show);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => setActive(0), [query]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === "Enter" && hits[active]) window.location.href = hits[active].href;
  };

  return (
    <>
      <button type="button" className="wl-search-open" onClick={show}>
        <span>Search docs</span><kbd>Ctrl K</kbd>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="wl-search-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div className="wl-search" role="dialog" aria-label="Search docs" initial={{ y: -12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.2 }} onClick={(e) => e.stopPropagation()}>
              <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder="Search the docs" aria-label="Search the docs" />
              <Results hits={hits} query={query} active={active} onPick={setActive} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
