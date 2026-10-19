import { useEffect, useMemo, useState } from "react";

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
  | "services"
  | "insights"
  | "search"
  | "settings"
  | "alerts"
  | "uptime"
  | "status"
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
const PAGES: readonly PageId[] = ["overview", "search", "requests", "traces", "database", "rendering", "errors", "logs", "metrics", "services", "insights", "settings", "alerts", "uptime", "team", "shared", "status", "account", ...AUTH_PAGES];
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

export function navigate(href: string): void {
  window.location.hash = href.replace(/^#/, "");
}

/** Change query values on the current route without a new history entry. Null removes a value. */
export function setQuery(updates: Record<string, string | number | null | undefined>): void {
  const route = parseRoute(window.location.hash);
  const next: Record<string, string> = Object.fromEntries(route.query.entries());
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === undefined || v === "") delete next[k];
    else next[k] = String(v);
  }
  const href = hrefTo(route.page, route.params, next);
  history.replaceState(null, "", href);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
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
