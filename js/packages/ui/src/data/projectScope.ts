// The project part of a request: one project, every project of the current organization (cloud "all"), or every project (hub "").
import { getScope, type Scope } from "./prefs";

/** The cloud's project choice for every project of the current organization. */
export const ALL_PROJECTS = "all";

/** The scope reads every project of the organization (cloud). */
export const isAllProjects = (s: Pick<Scope, "project"> = getScope()): boolean => s.project === ALL_PROJECTS;

/** Set `project` on a request's query, and `org` for all of the organization's. */
export function setProjectParams(q: URLSearchParams, s: Pick<Scope, "project" | "org"> = getScope()): void {
  if (!s.project) return;
  q.set("project", s.project);
  if (s.project === ALL_PROJECTS && s.org) q.set("org", s.org);
}

/** The same, as query text without "?": empty when the scope names no project. */
export function projectQuery(s: Pick<Scope, "project" | "org"> = getScope()): string {
  const q = new URLSearchParams();
  setProjectParams(q, s);
  return q.toString();
}

/** A cloud list of every project of the organization (`api/orgs/<org>/<what>`), or null when the scope is one project. */
export function orgListUrl(what: string, s: Pick<Scope, "project" | "org"> = getScope()): string | null {
  return s.project === ALL_PROJECTS && s.org ? `./api/orgs/${encodeURIComponent(s.org)}/${what}` : null;
}

/** A cloud resource of one project (`api/projects/<id>/<what>`): the item's own project, else the chosen one; under All without one, the organization's list. */
export function cloudResource(what: string, path = "", projectId?: string, s: Pick<Scope, "project" | "org"> = getScope()): string {
  const id = projectId || (isAllProjects(s) ? "" : s.project);
  if (id) return `./api/projects/${encodeURIComponent(id)}/${what}${path}`;
  return `./api/orgs/${encodeURIComponent(s.org)}/${what}${path}`;
}

/** A row of a list across projects: its project, and that project's label. */
export type InProject<T> = T & { projectId?: string; project?: string };
