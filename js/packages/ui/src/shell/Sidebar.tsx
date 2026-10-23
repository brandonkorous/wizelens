import { SavedNav } from "./SavedNav";
import { useHost } from "../data/host";
import { hrefTo, type PageId } from "../routes";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";
import { navFor, navPageOf } from "./nav";
import { NavGroups } from "./NavGroups";
import { SidebarFoot } from "./SidebarFoot";

export interface SidebarProps {
  page: PageId;
  /** Small red counts next to menu items, for example errors in the selected range. */
  counts?: Partial<Record<PageId, number>>;
  /** Health color of the logo dot. */
  dot?: string;
}

export function Sidebar({ page, counts = {}, dot }: SidebarProps) {
  const current = navPageOf(page);
  const host = useHost();
  const items = navFor(host.has);
  return (
    <aside className="wl-sidebar">
      <a className="wl-sidebar-brand" href={hrefTo("overview")} aria-label="WizeLens overview">
        <Logo dot={dot} />
      </a>
      <nav className="wl-nav wl-nav-main" aria-label="Main">
        <NavGroups items={items} current={current} counts={counts} />
      </nav>
      {host.has("saved") && <SavedNav />}
      <MobileNav items={items} current={current} counts={counts} saved={host.has("saved")} />
      <SidebarFoot />
    </aside>
  );
}
