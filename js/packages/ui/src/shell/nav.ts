import type { ComponentType } from "react";
import { Activity, BellRing, Box, Boxes, Building2, Database, FileText, HeartPulse, House, LayoutDashboard, Lightbulb, List, Monitor, Plug, Search, Server, Settings, Share2, ShieldAlert, Siren, Target, TriangleAlert, UserRound, Users } from "lucide-react";
import type { Capability } from "@wizeworks/lens-core";
import type { PageId } from "../routes";

export type NavGroupId = "start" | "investigate" | "infra" | "analyze" | "monitor" | "manage";

export interface NavItem {
  page: PageId;
  label: string;
  icon: ComponentType<{ "aria-hidden"?: boolean }>;
  group: NavGroupId;
  /** Shown only when the host has this capability. */
  needs?: Capability;
  /** Hidden when the host has this capability: another item takes its place. */
  hideWith?: Capability;
}

/** Menu sections in order. The first one has no heading. */
export const NAV_GROUPS: { id: NavGroupId; label: string }[] = [
  { id: "start", label: "" },
  { id: "investigate", label: "Investigate" },
  { id: "infra", label: "Infrastructure" },
  { id: "analyze", label: "Analyze" },
  { id: "monitor", label: "Monitor" },
  { id: "manage", label: "Manage" },
];

export const NAV: NavItem[] = [
  { page: "overview", label: "Overview", icon: House, group: "start" },
  { page: "problems", label: "Problems", icon: Siren, group: "start" },
  { page: "search", label: "Search", icon: Search, group: "start" },
  { page: "requests", label: "Requests", icon: List, group: "investigate" },
  { page: "traces", label: "Traces", icon: Share2, group: "investigate" },
  { page: "errors", label: "Errors", icon: TriangleAlert, group: "investigate" },
  { page: "logs", label: "Logs", icon: FileText, group: "investigate" },
  { page: "database", label: "Database", icon: Database, group: "investigate" },
  { page: "rendering", label: "Rendering", icon: Monitor, group: "investigate" },
  { page: "metrics", label: "Metrics", icon: Activity, group: "investigate", needs: "metrics" },
  { page: "services", label: "Services", icon: Box, group: "infra" },
  { page: "hosts", label: "Hosts", icon: Server, group: "infra", needs: "infra" },
  { page: "kubernetes", label: "Kubernetes", icon: Boxes, group: "infra", needs: "infra" },
  { page: "insights", label: "Insights", icon: Lightbulb, group: "analyze" },
  { page: "security", label: "Security", icon: ShieldAlert, group: "analyze" },
  { page: "users", label: "Users", icon: UserRound, group: "analyze" },
  { page: "alerts", label: "Alerts", icon: BellRing, group: "monitor", needs: "alerts" },
  { page: "uptime", label: "Uptime", icon: HeartPulse, group: "monitor", needs: "uptime" },
  { page: "slos", label: "SLOs", icon: Target, group: "monitor", needs: "slos" },
  { page: "dashboards", label: "Dashboards", icon: LayoutDashboard, group: "monitor", needs: "saved" },
  { page: "connect", label: "Connect", icon: Plug, group: "manage" },
  { page: "people", label: "People & access", icon: Users, group: "manage", needs: "accounts" },
  { page: "organization", label: "Organization", icon: Building2, group: "manage", needs: "accounts" },
  { page: "settings", label: "Settings", icon: Settings, group: "manage", hideWith: "accounts" },
];

/** The menu items this host shows. */
export const navFor = (has: (c: Capability) => boolean): NavItem[] => NAV.filter((n) => (!n.needs || has(n.needs)) && (!n.hideWith || !has(n.hideWith)));

/** The pages on the phone tab bar. Every other page is under "More". */
export const MOBILE_TABS: readonly PageId[] = ["overview", "problems", "requests", "errors"];

/** The menu page that a page belongs to, for example a trace belongs to Traces. */
export const navPageOf = (page: PageId): PageId => (page === "trace" ? "traces" : page);
