import { issueId, issueStatusOf } from "../issues.js";
import type { PageData, PageDef } from "../scale/needs.js";
import { OWASP_CATEGORIES, type OwaspId } from "../security/kinds.js";
import { percentChange, series, type TimeWindow } from "../stats/common.js";
import { type Headline, SPARK_BUCKETS } from "../stats/overview.js";
import { type IssueInfo, isIssueFilter } from "./error-issues.js";
import { META_NEEDS, type ModelMeta, type ModelParams, metaOf, serviceParam } from "./input.js";
import { GROUP_PAGE_SIZE, IMPACT_RANK, type PageInfo, pagedRows, type SortValue } from "./paged.js";
import { groupNeed, rowsOf, uniqueNeeds } from "./read.js";
import { firstSeenBounds, inBounds, releasesNeed, releasesOf } from "./release-rows.js";
import type { PackageScan } from "../packages.js";
import { compareSecurity, type SecurityGroup, securityGroupsOf, securityNeeds } from "./security-groups.js";
import { packageGroupsOf } from "./security-packages.js";
import { type UsersAffected, usersNeed, usersOf } from "./user-rows.js";

export interface SecurityTotals {
  count: number;
  high: number;
  /** Distinct endpoints with a risk. */
  endpoints: number;
}

export interface SecurityCategory {
  id: OwaspId;
  name: string;
  count: number;
  high: number;
}

export interface SecurityModel {
  meta: ModelMeta;
  totals: SecurityTotals;
  prevTotals: SecurityTotals;
  /** "Security Risks": the distinct risks in the window. */
  found: Headline;
  /** The OWASP Top 10:2025, each with its risks under the status, release, and service filters. */
  categories: SecurityCategory[];
  /** One page of the groups that match every filter, most important first or in the `sort` column's order. */
  groups: SecurityGroup[];
  matching: number;
  paging: PageInfo;
  selected: SecurityGroup | null;
  issues: Record<string, IssueInfo>;
  hasIssues: boolean;
  releases: { version: string; firstMs: number }[];
  selectedUsers: UsersAffected | null;
  /** What the host checked against OSV; null where packages are not checked. */
  scan: PackageScan | null;
}

/** Columns the security list sorts by (sort=-seen). */
const SECURITY_SORTS: Record<string, SortValue<SecurityGroup>> = {
  impact: (g) => IMPACT_RANK[g.impact],
  title: (g) => g.title,
  owasp: (g) => g.owasp,
  kind: (g) => g.kind,
  seen: (g) => g.occurrences,
  last: (g) => g.lastSeenMs,
};

const totalsOf = (groups: readonly SecurityGroup[]): SecurityTotals => ({
  count: groups.length,
  high: groups.filter((g) => g.impact === "high").length,
  endpoints: new Set(groups.flatMap((g) => g.endpoints)).size,
});

/** "Security Risks" with its change and spark line. */
export function securityHeadline(groups: readonly SecurityGroup[], prev: readonly SecurityGroup[], w: TimeWindow): Headline {
  const previous = prev.length > 0 ? prev.length : null;
  return { value: groups.length, previous, change: percentChange(groups.length, previous), series: series(groups, (g) => g.lastSeenMs, w, SPARK_BUCKETS) };
}

/** Category, severity, endpoint, and text filters. "all" or "" means no filter. */
function matches(g: SecurityGroup, p: ModelParams): boolean {
  if (p.category && p.category !== "all" && g.owasp !== p.category) return false;
  if (p.severity && p.severity !== "all" && g.severity !== p.severity) return false;
  if (p.endpoint && !g.endpoints.includes(p.endpoint)) return false;
  const q = (p.q ?? "").toLowerCase();
  return !q || `${g.title} ${g.description} ${g.shape} ${g.endpoints.join(" ")}`.toLowerCase().includes(q);
}

/** Each risk as an issue: its status, first seen over all time, and assignee. Issue states are kept as insights. */
export function securityIssues(d: PageData, groups: readonly SecurityGroup[]): Record<string, IssueInfo> {
  const issues = d.issues ?? {};
  const life = new Map(rowsOf(d, "sec.life").map((r) => [r.key, r.agg.firstMs]));
  return Object.fromEntries(
    groups.map((g) => {
      const first = Math.min(life.get(g.key) ?? g.firstSeenMs, g.firstSeenMs);
      const state = issues[issueId("insight", g.key)];
      return [g.key, { status: issueStatusOf(state, g.lastSeenMs, d.now), firstSeenMs: first, isNew: first >= d.window.from, assignee: state?.assignee ?? null }];
    }),
  );
}

const categoriesOf = (groups: readonly SecurityGroup[]): SecurityCategory[] =>
  OWASP_CATEGORIES.map((c) => {
    const of = groups.filter((g) => g.owasp === c.id);
    return { ...c, count: of.length, high: of.filter((g) => g.impact === "high").length };
  });

/** The Security page. Params: service, status, release (with service), category (A01..A10), severity, endpoint, q, key. */
export const securityPage: PageDef<SecurityModel> = {
  needs: (ctx) => {
    const service = serviceParam(ctx.params);
    const life = groupNeed("sec.life", "sec", "all", service ? { service } : {});
    const releases = service ? [releasesNeed("rel.svc", service)] : [];
    const users = ctx.params.key ? [usersNeed("users", "sec.u", [ctx.params.key])] : [];
    return uniqueNeeds([...META_NEEDS, ...securityNeeds("cur", service), ...securityNeeds("prev", service), life, ...releases, ...users]);
  },
  model(d) {
    const service = serviceParam(d.params);
    const groups = [...securityGroupsOf(d, "cur", service), ...packageGroupsOf(d.packages, service)].sort(compareSecurity);
    const prev = securityGroupsOf(d, "prev", service);
    const status = isIssueFilter(d.params.status) ? d.params.status : "unresolved";
    const all = securityIssues(d, groups);
    const shown = (g: SecurityGroup) => status === "all" || all[g.key]!.status === status || (status === "unresolved" && all[g.key]!.status === "regressed");
    const bounds = firstSeenBounds(d, "rel.svc", service ? (d.params.release ?? "") : "", null);
    const scoped = groups.filter((g) => shown(g) && (!bounds || inBounds(bounds, all[g.key]!.firstSeenMs)));
    const visible = scoped.filter((g) => matches(g, d.params));
    const page = pagedRows(visible, d.params, "", GROUP_PAGE_SIZE, SECURITY_SORTS);
    return {
      meta: metaOf(d),
      totals: totalsOf(groups),
      prevTotals: totalsOf(prev),
      found: securityHeadline(groups, prev, d.window),
      categories: categoriesOf(scoped),
      groups: page.rows,
      matching: visible.length,
      paging: page.paging,
      selected: d.params.key ? (groups.find((g) => g.key === d.params.key) ?? null) : null,
      issues: all,
      hasIssues: !!d.issues,
      releases: releasesOf(d, "rel.svc").map((r) => ({ version: r.version, firstMs: r.firstMs })),
      selectedUsers: d.params.key ? usersOf(d, "users") : null,
      scan: d.packageScan ?? null,
    };
  },
};
