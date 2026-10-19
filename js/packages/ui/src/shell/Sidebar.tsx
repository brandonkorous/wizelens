import type { ComponentType } from "react";
import { Activity, BellRing, Box, Boxes, Database, FileText, HeartPulse, House, Lightbulb, List, Monitor, Search, Server, Settings, Share2, Siren, TriangleAlert, Users } from "lucide-react";
import type { Capability } from "@wizeworks/lens-core";
import { useHost } from "../data/host";
import { hrefTo, type PageId } from "../routes";
import { Logo } from "./Logo";

interface NavItem {
  page: PageId;
  label: string;
  icon: ComponentType<{ "aria-hidden"?: boolean }>;
  /** Shown only when the host has this capability. */
  needs?: Capability;
}

export const NAV: NavItem[] = [
  { page: "overview", label: "Overview", icon: House },
  { page: "problems", label: "Problems", icon: Siren },
  { page: "search", label: "Search", icon: Search },
  { page: "requests", label: "Requests", icon: List },
  { page: "traces", label: "Traces", icon: Share2 },
  { page: "database", label: "Database", icon: Database },
  { page: "rendering", label: "Rendering", icon: Monitor },
  { page: "errors", label: "Errors", icon: TriangleAlert },
  { page: "logs", label: "Logs", icon: FileText },
  { page: "metrics", label: "Metrics", icon: Activity, needs: "metrics" },
  { page: "hosts", label: "Hosts", icon: Server, needs: "infra" },
  { page: "kubernetes", label: "Kubernetes", icon: Boxes, needs: "infra" },
  { page: "services", label: "Services", icon: Box },
  { page: "insights", label: "Insights", icon: Lightbulb },
  { page: "uptime", label: "Uptime", icon: HeartPulse, needs: "uptime" },
  { page: "alerts", label: "Alerts", icon: BellRing, needs: "alerts" },
  { page: "team", label: "Team", icon: Users, needs: "accounts" },
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
  const host = useHost();
  const items = NAV.filter((n) => !n.needs || host.has(n.needs));
  return (
    <aside className="wl-sidebar">
      <a className="wl-sidebar-brand" href={hrefTo("overview")} aria-label="WizeLens overview">
        <Logo dot={dot} />
      </a>
      <nav className="wl-nav" aria-label="Main">
        {items.map(({ page: p, label, icon: Icon }) => (
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
