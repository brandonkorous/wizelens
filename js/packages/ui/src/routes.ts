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
  | "services"
  | "insights"
  | "settings";

export interface Route {
  page: PageId;
  /** Path parts after the page, for example [traceId, view] on "trace". */
  params: string[];
  query: URLSearchParams;
}

const PAGES: readonly PageId[] = ["overview", "requests", "traces", "database", "rendering", "errors", "logs", "services", "insights", "settings"];
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
