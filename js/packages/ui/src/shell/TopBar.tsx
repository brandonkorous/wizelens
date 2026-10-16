import { useCallback, useState } from "react";
import { Search } from "lucide-react";
import type { DataSnapshot } from "../data/store";
import { Notifications } from "./Notifications";
import { SearchPalette, useSearchShortcut } from "./SearchPalette";
import { EnvMenu, ModeBadge, RangeMenu, ThemeToggle } from "./TopMenus";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function TopBar({ data }: { data: DataSnapshot }) {
  const [searching, setSearching] = useState(false);
  const open = useCallback(() => setSearching(true), []);
  useSearchShortcut(open);
  return (
    <header className="wl-topbar">
      <button type="button" className="wl-search-box" onClick={open} aria-label="Search">
        <Search size={18} aria-hidden="true" />
        <span className="wl-truncate">Search requests, traces, errors, services…</span>
        <kbd>{isMac ? "⌘ K" : "Ctrl K"}</kbd>
      </button>
      <span className="wl-spacer" />
      <ModeBadge />
      <EnvMenu sources={data.sources} />
      <RangeMenu />
      <Notifications traces={data.traces} now={data.updatedMs} />
      <ThemeToggle />
      {searching && <SearchPalette traces={data.traces} onClose={() => setSearching(false)} />}
    </header>
  );
}
