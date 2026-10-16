import type { ComponentType } from "react";
import { Box, Database, FileText, House, Lightbulb, List, Monitor, Settings, Share2, TriangleAlert } from "lucide-react";
import { hrefTo, type PageId } from "../routes";
import { Logo } from "./Logo";

interface NavItem {
  page: PageId;
  label: string;
  icon: ComponentType<{ "aria-hidden"?: boolean }>;
}

export const NAV: NavItem[] = [
  { page: "overview", label: "Overview", icon: House },
  { page: "requests", label: "Requests", icon: List },
  { page: "traces", label: "Traces", icon: Share2 },
  { page: "database", label: "Database", icon: Database },
  { page: "rendering", label: "Rendering", icon: Monitor },
  { page: "errors", label: "Errors", icon: TriangleAlert },
  { page: "logs", label: "Logs", icon: FileText },
  { page: "services", label: "Services", icon: Box },
  { page: "insights", label: "Insights", icon: Lightbulb },
  { page: "settings", label: "Settings", icon: Settings },
];

export interface SidebarProps {
  page: PageId;
  /** Small red counts next to menu items, for example errors in the selected range. */
  counts?: Partial<Record<PageId, number>>;
  /** Health color of the logo dot. */
  dot?: string;
}

export function Sidebar({ page, counts = {}, dot }: SidebarProps) {
  const current = page === "trace" ? "traces" : page;
  return (
    <aside className="wl-sidebar">
      <a className="wl-sidebar-brand" href={hrefTo("overview")} aria-label="WizeLens overview">
        <Logo dot={dot} />
      </a>
      <nav className="wl-nav" aria-label="Main">
        {NAV.map(({ page: p, label, icon: Icon }) => (
          <a key={p} href={hrefTo(p)} className={current === p ? "wl-active" : undefined} aria-current={current === p ? "page" : undefined} title={label}>
            <Icon aria-hidden={true} />
            <span>{label}</span>
            {!!counts[p] && <em className="wl-nav-count">{counts[p]! > 99 ? "99+" : counts[p]}</em>}
          </a>
        ))}
      </nav>
      <div className="wl-sidebar-foot">
        <span className="wl-mark" aria-hidden="true">W</span>
        <div>
          <strong>WizeWorks</strong>
          <span>Build. Observe. Ship.</span>
        </div>
      </div>
    </aside>
  );
}
