// The Errors page filter: which error groups the list shows, in what order, one page at a time.
import { splitKey } from "../scale/kinds.js";
import type { GroupNeed, NeedResults } from "../scale/needs.js";
import { type IssueFilter, isIssueFilter } from "./error-issues.js";
import { type ModelParams, pageParams, serviceParam } from "./input.js";
import { groupNeed, rowsOf } from "./read.js";

export type ErrorSort = "recent" | "count";

export interface ErrorFilter {
  /** A service's display name; "" for all. */
  service: string;
  type: string;
  endpoint: string;
  critical: boolean;
  /** Text in the service, type, or message shape. */
  q: string;
  sort: ErrorSort;
  /** Which issues: unresolved (the default), resolved, ignored, or all. */
  status: IssueFilter;
  /** Only groups first seen in this range. */
  fresh: boolean;
}

export const ERROR_PAGE_SIZE = 15;

/** The filter from URL parameters: service, type, endpoint, critical=1, q, sort=count, status, new=1. */
export const errorFilterOf = (p: ModelParams): ErrorFilter => ({
  service: serviceParam(p) ?? "",
  type: p.type?.trim() ?? "",
  endpoint: p.endpoint?.trim() ?? "",
  critical: p.critical === "1",
  q: p.q?.trim() ?? "",
  sort: p.sort === "count" ? "count" : "recent",
  status: isIssueFilter(p.status) ? p.status : "unresolved",
  fresh: p.new === "1",
});

/** True when a filter narrows the list (sort does not). */
export const isErrorFiltered = (f: ErrorFilter): boolean => !!(f.service || f.type || f.endpoint || f.critical || f.q || f.fresh || f.status !== "unresolved");

/** Groups that happened on the endpoint, read first when the filter names one. */
export const endpointGroupsNeed = (endpoint: string): GroupNeed => groupNeed("ep.groups", "err.ge", "cur", { filter: { parts: [null, endpoint] } });

/** Group keys from `endpointGroupsNeed`. */
export const endpointGroupKeys = (d: NeedResults): string[] => rowsOf(d, "ep.groups").map((r) => splitKey(r.key)[0]!);

/** One page of matching groups, newest or busiest first. Group keys start with "service|type|". */
export function errorListNeed(f: ErrorFilter, p: ModelParams, sets: { keys?: readonly string[]; exclude?: readonly string[] } = {}): GroupNeed {
  const { page, size } = pageParams(p, ERROR_PAGE_SIZE);
  const contains = [f.type ? `|${f.type}|` : "", f.q].filter(Boolean);
  const filter = { ...(f.service ? { prefix: `${f.service}|` } : {}), ...(contains.length ? { contains } : {}), ...sets };
  const order = { by: f.sort === "count" ? "n" : "lastMs", desc: true, limit: size, offset: (page - 1) * size } as const;
  return groupNeed("groups", "err.g", "cur", { top: true, ids: true, filter, order, ...(f.critical ? { having: { by: "c0", min: 0.5 } } : {}) });
}
