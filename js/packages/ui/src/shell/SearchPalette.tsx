import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, BellRing, Bookmark, Box, Database, FileSearch, FileText, Lightbulb, List, Search, Share2, ShieldAlert, Target, TriangleAlert } from "lucide-react";
import type { Trace } from "@wizeworks/lens-core/internal";
import { useHost, useRange } from "../data/host";
import { navigate } from "../routes";
import { usePaletteMore } from "./paletteMore";
import { usePaletteSearch } from "./paletteSearch";
import { type HitKind, search } from "./searchIndex";
import { navFor } from "./nav";

const ICONS: Record<HitKind, typeof Search> = {
  page: FileSearch,
  request: List,
  trace: Share2,
  error: TriangleAlert,
  service: Box,
  log: FileText,
  search: Search,
  query: Database,
  insight: Lightbulb,
  security: ShieldAlert,
  metric: Activity,
  alert: BellRing,
  slo: Target,
  saved: Bookmark,
};

/** Ctrl+K / Cmd+K opens search. */
export function useSearchShortcut(open: () => void): void {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
}

export function SearchPalette({ traces, onClose }: { traces: readonly Trace[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const host = useHost();
  const server = host.has("search");
  const [range] = useRange();
  const remote = usePaletteSearch(query, range, server);
  const more = usePaletteMore(query, range, server);
  const local = useMemo(() => search(traces, navFor(host.has), query, server), [traces, host, query, server]);
  const hits = useMemo(() => [...remote.slice(0, 1), ...local, ...more, ...remote.slice(1)], [remote, local, more]);
  const go = (i: number) => {
    const hit = hits[i];
    if (!hit) return;
    navigate(hit.href);
    onClose();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") setActive((a) => Math.min(hits.length - 1, a + 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if (e.key === "Enter") go(active);
    else return;
    e.preventDefault();
  };
  // On <body>: the top bar's backdrop-filter would make the fixed backdrop cover only the top bar.
  return createPortal(
    <div className="wl-palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wl-palette" role="dialog" aria-label="Search">
        <input autoFocus value={query} onChange={(e) => (setQuery(e.target.value), setActive(0))} onKeyDown={onKey} placeholder="Search requests, errors, queries, insights, metrics, alerts, saved views…" aria-label="Search" />
        <div className="wl-palette-list" role="listbox">
          {hits.length === 0 && <div className="wl-palette-empty">No matches.</div>}
          {hits.map((h, i) => {
            const Icon = ICONS[h.kind];
            return (
              <div key={h.key} role="option" aria-selected={i === active} className={`wl-palette-item${i === active ? " wl-active" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => go(i)}>
                <Icon aria-hidden="true" />
                <span className="wl-truncate">{h.title}</span>
                <span className="wl-muted wl-small wl-truncate">{h.detail}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
