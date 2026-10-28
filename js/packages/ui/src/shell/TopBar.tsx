import { useCallback, useState } from "react";
import { Search } from "lucide-react";
import type { DataSnapshot } from "../data/store";
import { currentProject, useAccount } from "../data/account";
import { ALL_PROJECTS } from "../data/projectScope";
import { useHost } from "../data/host";
import { ServiceChip } from "../ui/ServiceSelect";
import { type CloudChoices, HubMenu } from "./HubMenu";
import { UserMenu } from "./UserMenu";
import { Notifications } from "./Notifications";
import { SearchPalette, useSearchShortcut } from "./SearchPalette";
import { RangeMenu } from "./RangeMenu";
import { SaveView } from "./SaveView";
import { SharePage } from "./SharePage";
import { EnvMenu, ModeBadge, ThemeToggle } from "./TopMenus";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Cloud: the shown organization's projects, "All projects" first when it has more than one; and the person's organizations. */
function useProjectChoices(): CloudChoices | undefined {
  const account = useAccount();
  const cloud = useHost().has("accounts");
  const current = currentProject(account);
  if (!cloud) return undefined;
  const own = (current?.org.projects ?? []).map((p): [string, string] => [p.id, p.name]);
  const projects: [string, string][] = own.length > 1 ? [[ALL_PROJECTS, "All projects"], ...own] : own;
  return { projects, orgs: account?.orgs ?? [], org: current?.org ?? null };
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
      {data.registry ? <HubMenu registry={data.registry} cloud={projects} /> : <EnvMenu sources={data.sources} />}
      <RangeMenu />
      <SaveView />
      <SharePage />
      <Notifications traces={data.traces} now={data.updatedMs} />
      <ThemeToggle className={projects ? "wl-hide-phone" : ""} />
      {projects && <UserMenu />}
      {searching && <SearchPalette traces={data.traces} onClose={() => setSearching(false)} />}
    </header>
  );
}
