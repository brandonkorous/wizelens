// The view choices (range, custom window, compare, environment, project, service) in the address bar, so a link shows the same view.
import { useEffect } from "react";
import { isTimeRange } from "@wizeworks/lens-core";
import { type PageId, parseRoute, setQuery, useRoute } from "../routes";
import { PERIOD_KEYS, parseWindow, windowText } from "./period";
import { KEYS, onViewWrite, readPref, SCOPE, writePref } from "./prefs";

/** Pages whose numbers follow the view choices. */
const VIEW_PAGES: ReadonlySet<PageId> = new Set(["overview", "problems", "search", "requests", "traces", "database", "rendering", "errors", "logs", "metrics", "services", "insights", "security"]);

type ViewValues = Record<string, string | null>;

/** The address bar values of one stored choice. On Services, `service` names a row, so the service filter stays out. */
function urlValuesOf(page: PageId, key: string, value: string): ViewValues {
  if (key === PERIOD_KEYS.window) {
    const w = parseWindow(value);
    return { from: w ? String(w.from) : null, to: w ? String(w.to) : null };
  }
  if (key === PERIOD_KEYS.compare) return { compare: value === "week" ? value : null };
  if (key === KEYS.range) return { range: value || null };
  if (key === SCOPE.env) return { env: value || null };
  if (key === SCOPE.project) return { project: value || null };
  if (key === SCOPE.org) return { org: value || null };
  if (key === SCOPE.service && page !== "services") return { service: value || null };
  return {};
}

const VIEW_KEYS = [KEYS.range, PERIOD_KEYS.window, PERIOD_KEYS.compare, SCOPE.env, SCOPE.org, SCOPE.project, SCOPE.service];

/** Write a choice into the address bar, when it differs and the page follows choices. */
function pushChoice(key: string, value: string): void {
  const route = parseRoute(window.location.hash);
  if (!VIEW_PAGES.has(route.page)) return;
  const values = urlValuesOf(route.page, key, value);
  const changed = Object.entries(values).some(([k, v]) => (route.query.get(k) ?? null) !== v);
  if (changed) setQuery(values);
}

/** The stored value a link's address bar asks for, or undefined when it names none. */
function linkValueOf(page: PageId, key: string, q: URLSearchParams): string | undefined {
  // A link with a preset range and no from–to means that range, not a custom window kept from before.
  if (key === PERIOD_KEYS.window) return q.has("from") && q.has("to") ? windowText(parseWindow(`${q.get("from")}-${q.get("to")}`)) : q.has("range") ? "" : undefined;
  if (key === PERIOD_KEYS.compare) return q.has("compare") ? (q.get("compare") === "week" ? "week" : "previous") : undefined;
  if (key === KEYS.range) return isTimeRange(q.get("range") ?? "") ? q.get("range")! : undefined;
  const name = key === SCOPE.env ? "env" : key === SCOPE.project ? "project" : key === SCOPE.org ? "org" : page === "services" ? null : "service";
  return name && q.has(name) ? q.get(name)! : undefined;
}

/** Elsewhere (Organization, People) a link may still name an organization or a project (an email's link): it shows that one. */
function linkScope(org: string | null, project: string | null): void {
  if (org && org !== readPref(SCOPE.org)) writePref(SCOPE.org, org);
  if (project && project !== readPref(SCOPE.project)) writePref(SCOPE.project, project);
}

/** Keep the address bar and the stored choices together: a link's values win, and choices fill in what a link leaves out. */
export function useViewInUrl(): void {
  const route = useRoute();
  const hash = `${route.page}?${route.query.toString()}`;
  useEffect(() => onViewWrite(pushChoice), []);
  useEffect(() => {
    const project = route.query.get("project");
    if (!VIEW_PAGES.has(route.page)) return void linkScope(route.query.get("org"), project);
    for (const key of VIEW_KEYS) {
      const fromLink = linkValueOf(route.page, key, route.query);
      if (fromLink !== undefined && fromLink !== (readPref(key) ?? "")) writePref(key, fromLink);
      else if (fromLink === undefined && readPref(key)) pushChoice(key, readPref(key)!);
    }
  }, [hash]);
}
