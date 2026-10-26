import { useEffect, useMemo, useState } from "react";
import { getScope } from "./data/prefs";

export type PageId =
  | "overview"
  | "requests"
  | "traces"
  | "trace"
  | "database"
  | "rendering"
  | "errors"
  | "logs"
  | "metrics"
  | "hosts"
  | "kubernetes"
  | "services"
  | "insights"
  | "security"
  | "problems"
  | "search"
  | "settings"
  | "connect"
  | "people"
  | "organization"
  | "alerts"
  | "uptime"
  | "status"
  | "slos"
  | "dashboards"
  | "users"
  | "team"
  | "shared"
  | "account"
  | AuthPageId;

/** Account screens that open signed in or not (cloud only): links from emails and the sign-in steps. */
export type AuthPageId = "setup" | "two-factor" | "forgot-password" | "reset-password" | "verify-email" | "invite" | "delete-account" | "oauth" | "oauth-consent";

export interface Route {
  page: PageId;
  /** Path parts after the page, for example [traceId, view] on "trace". */
  params: string[];
  query: URLSearchParams;
}

export const AUTH_PAGES: readonly AuthPageId[] = ["setup", "two-factor", "forgot-password", "reset-password", "verify-email", "invite", "delete-account", "oauth", "oauth-consent"];
const PAGES: readonly PageId[] = ["overview", "problems", "search", "requests", "traces", "database", "rendering", "errors", "logs", "metrics", "hosts", "kubernetes", "services", "insights", "security", "settings", "connect", "people", "organization", "alerts", "slos", "dashboards", "users", "uptime", "team", "shared", "status", "account", ...AUTH_PAGES];
const TRACE_ID = /^[0-9a-f]{32}$/;

/** Read a hash like "#/requests?status=5xx" or "#/traces/<id>/sql". */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const q = raw.indexOf("?");
  const path = (q >= 0 ? raw.slice(0, q) : raw).split("/").filter(Boolean);
  const query = new URLSearchParams(q >= 0 ? raw.slice(q + 1) : "");
  const [first = "overview", ...rest] = path;
  if (first === "traces" && rest[0] && TRACE_ID.test(rest[0])) return { page: "trace", params: rest, query };
  const page = (PAGES as readonly string[]).includes(first) ? (first as PageId) : "overview";
  return { page, params: rest, query };
}

/** Link to a page. Empty query values are left out. */
export function hrefTo(page: PageId, params: string[] = [], query: Record<string, string | number | null | undefined> = {}): string {
  const base = page === "trace" ? "traces" : page === "overview" ? "" : page;
  const path = [base, ...params].filter(Boolean).join("/");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return `#/${path}${s ? `?${s}` : ""}`;
}

export const traceHref = (traceId: string, view?: string) => hrefTo("trace", view ? [traceId, view] : [traceId]);

const enc = encodeURIComponent;

/** A path part as typed in a link; a broken escape is kept as it is. */
export function decodeParam(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** Detail pages: one error group, one endpoint of a service, one query shape, one page route. */
export const errorHref = (groupKey: string) => hrefTo("errors", [enc(groupKey)]);
export const endpointHref = (service: string, endpoint: string) => hrefTo("services", [enc(service), "endpoints", enc(endpoint)]);
export const queryHref = (query: string) => hrefTo("database", ["queries", enc(query)]);
export const routeHref = (route: string) => hrefTo("rendering", ["routes", enc(route)]);
/** A rule or SLO; with its project (a row under "All projects"), the link shows that project. */
export const alertHref = (id: string, project?: string) => hrefTo("alerts", [enc(id)], project ? { project } : {});
export const sloHref = (id: string, project?: string) => hrefTo("slos", [enc(id)], project ? { project } : {});
/** A dashboard; one of a project, opened under "All projects", shows in that project. */
export const dashboardHref = (id: string, project?: string) => hrefTo("dashboards", [enc(id)], project && getScope().project === "all" ? { project } : {});
export const userHref = (user: string) => hrefTo("users", [enc(user)]);
/** The Alerts page with a new rule open, filled from what the person was looking at. */
export const newAlertHref = (fields: Record<string, string>) => hrefTo("alerts", [], { new: "1", ...fields });

/** Old Team links and where each section went. */
const TEAM_MOVES: Record<string, [PageId, string]> = {
  "": ["people", "members"],
  people: ["people", "members"],
  projects: ["organization", "projects"],
  keys: ["connect", "keys"],
  apps: ["people", "apps"],
  sso: ["people", "sso"],
  scim: ["people", "scim"],
  links: ["people", "links"],
  audit: ["people", "audit"],
  billing: ["organization", "billing"],
  organization: ["organization", "general"],
};

/** Old Settings sections that moved to another page or name. */
const SETTINGS_MOVES: Record<string, (cloud: boolean) => [PageId, string]> = {
  dashboard: (cloud) => (cloud ? ["account", "preferences"] : ["settings", "preferences"]),
  project: (cloud) => [cloud ? "organization" : "settings", "checks"],
  connect: () => ["connect", "setup"],
  services: () => ["connect", "server"],
  options: () => ["connect", "options"],
};

/** Where an old Team or Settings link (emails, bookmarks, Stripe) opens now, with its query; null for every other link. */
export function legacyHref(route: Route, cloud: boolean): string | null {
  const section = route.params[0] ?? "";
  const query = Object.fromEntries(route.query.entries());
  if (route.page === "team") {
    const [page, to] = TEAM_MOVES[section] ?? TEAM_MOVES[""]!;
    return hrefTo(page, [to], query);
  }
  if (route.page !== "settings") return null;
  const moved = SETTINGS_MOVES[section];
  if (moved) return hrefTo(moved(cloud)[0], [moved(cloud)[1]], query);
  return cloud ? hrefTo("organization", section ? [section] : [], query) : null;
}

/** Swap the current address for another, with no new history entry. */
export function replaceHref(href: string): void {
  history.replaceState(null, "", href);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function navigate(href: string): void {
  window.location.hash = href.replace(/^#/, "");
}

/** URL keys of a table paged in the browser ("hosts.page", "hosts.size"). Models never see them. */
export const CLIENT_PAGING = /\.(page|size)$/;

/** Change query values on the current route without a new history entry. Null removes a value. */
export function setQuery(updates: Record<string, string | number | null | undefined>): void {
  const route = parseRoute(window.location.hash);
  const next: Record<string, string> = Object.fromEntries(route.query.entries());
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === undefined || v === "") delete next[k];
    else next[k] = String(v);
  }
  replaceHref(hrefTo(route.page, route.params, next));
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return useMemo(() => parseRoute(hash), [hash]);
}
