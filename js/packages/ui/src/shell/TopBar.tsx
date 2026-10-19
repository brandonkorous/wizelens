import { useCallback, useState } from "react";
import { Search } from "lucide-react";
import type { DataSnapshot } from "../data/store";
import { useAccount } from "../data/account";
import { useHost } from "../data/host";
import { ServiceChip } from "../ui/ServiceSelect";
import { HubMenu } from "./HubMenu";
import { UserMenu } from "./UserMenu";
import { Notifications } from "./Notifications";
import { SearchPalette, useSearchShortcut } from "./SearchPalette";
import { RangeMenu } from "./RangeMenu";
import { EnvMenu, ModeBadge, ThemeToggle } from "./TopMenus";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Cloud: projects come from the signed-in person's organizations, labeled "Org / Project". */
function useProjectChoices(): [string, string][] | undefined {
  const account = useAccount();
  const cloud = useHost().has("accounts");
  if (!cloud) return undefined;
  return (account?.orgs ?? []).flatMap((o) => o.projects.map((p): [string, string] => [p.id, `${o.name} / ${p.name}`]));
}

export function TopBar({ data }: { data: DataSnapshot }) {
  const [searching, setSearching] = useState(false);
  const projects = useProjectChoices();
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
      <ServiceChip />
      {data.registry ? <HubMenu registry={data.registry} projects={projects} /> : <EnvMenu sources={data.sources} />}
      <RangeMenu />
      <Notifications traces={data.traces} now={data.updatedMs} />
      <ThemeToggle />
      {projects && <UserMenu />}
      {searching && <SearchPalette traces={data.traces} onClose={() => setSearching(false)} />}
    </header>
  );
}
