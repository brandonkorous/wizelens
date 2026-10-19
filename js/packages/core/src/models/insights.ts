import { issueId, issueStatusOf } from "../issues.js";
import type { PageData, PageDef } from "../scale/needs.js";
import { type InsightGroup, insightHeadline } from "../stats/insights.js";
import type { Headline } from "../stats/overview.js";
import { MODEL_LIST_MAX } from "./database.js";
import { META_NEEDS, type ModelMeta, type ModelParams, metaOf, serviceParam } from "./input.js";
import { insightGroupsOf, insightNeeds } from "./insight-groups.js";
import { type IssueInfo, isIssueFilter } from "./error-issues.js";
import { groupNeed, rowsOf, uniqueNeeds } from "./read.js";
import { firstSeenBounds, inBounds, releasesNeed, releasesOf } from "./release-rows.js";

export interface InsightTotals {
  count: number;
  high: number;
  totalMs: number;
}

export interface InsightsModel {
  meta: ModelMeta;
  totals: InsightTotals;
  prevTotals: InsightTotals;
  /** "Insights Found", the same number the Overview shows. */
  found: Headline;
  /** Groups that match the filters, most important first. */
  groups: InsightGroup[];
  matching: number;
  /** The `key` parameter's group, when it is in the range. */
  selected: InsightGroup | null;
  /** Issue status, first seen, and assignee of every group in the range. */
  issues: Record<string, IssueInfo>;
  /** True when the host keeps issue states (dismiss and mark fixed work). */
  hasIssues: boolean;
  /** The chosen service's versions, newest first, for the release filter. */
  releases: { version: string; firstMs: number }[];
}

const totalsOf = (groups: readonly InsightGroup[]): InsightTotals => ({
  count: groups.length,
  high: groups.filter((g) => g.impact === "high").length,
  totalMs: groups.reduce((t, g) => t + g.totalMs, 0),
});

/** Area, impact, endpoint, and text filters. "all" or "" means no filter. */
function matches(g: InsightGroup, p: ModelParams): boolean {
  if (p.area && p.area !== "all" && g.area !== p.area) return false;
  if (p.endpoint && !g.endpoints.includes(p.endpoint)) return false;
  if (p.impact && p.impact !== "all" && g.impact !== p.impact) return false;
  const q = (p.q ?? "").toLowerCase();
  return !q || `${g.title} ${g.description} ${g.shape} ${g.endpoints.join(" ")}`.toLowerCase().includes(q);
}

/** Each listed insight as an issue: its status, first seen over all time (request insights), and assignee. */
export function insightIssues(d: PageData, groups: readonly InsightGroup[]): Record<string, IssueInfo> {
  const issues = d.issues ?? {};
  const life = new Map(rowsOf(d, "ins.life").map((r) => [r.key, r.agg.firstMs]));
  return Object.fromEntries(
    groups.map((g) => {
      const first = life.get(g.key) ?? g.lastSeenMs;
      const state = issues[issueId("insight", g.key)];
      return [g.key, { status: issueStatusOf(state, g.lastSeenMs, d.now), firstSeenMs: first, isNew: first >= d.window.from, assignee: state?.assignee ?? null }];
    }),
  );
}

/** The Insights page. Params: area, impact, q, endpoint, service, status (unresolved, resolved, ignored, all), release (with service), key. */
export const insightsPage: PageDef<InsightsModel> = {
  needs: (ctx) => {
    const service = serviceParam(ctx.params);
    const life = groupNeed("ins.life", "ins", "all", service ? { service } : {});
    const releases = service ? [releasesNeed("rel.svc", service)] : [];
    return uniqueNeeds([...META_NEEDS, ...insightNeeds("cur", "all", service), ...insightNeeds("prev", "all", service), life, ...releases]);
  },
  model(d) {
    const groups = insightGroupsOf(d, "cur");
    const prev = insightGroupsOf(d, "prev");
    const status = isIssueFilter(d.params.status) ? d.params.status : "unresolved";
    const all = insightIssues(d, groups);
    const shown = (g: InsightGroup) => status === "all" || all[g.key]!.status === status || (status === "unresolved" && all[g.key]!.status === "regressed");
    const bounds = firstSeenBounds(d, "rel.svc", serviceParam(d.params) ? (d.params.release ?? "") : "", null);
    const visible = groups.filter((g) => matches(g, d.params) && shown(g) && (!bounds || inBounds(bounds, all[g.key]!.firstSeenMs)));
    return {
      meta: metaOf(d),
      totals: totalsOf(groups),
      prevTotals: totalsOf(prev),
      found: insightHeadline(groups, prev, d.window),
      groups: visible.slice(0, MODEL_LIST_MAX),
      matching: visible.length,
      selected: d.params.key ? (groups.find((g) => g.key === d.params.key) ?? null) : null,
      issues: all,
      hasIssues: !!d.issues,
      releases: releasesOf(d, "rel.svc").map((r) => ({ version: r.version, firstMs: r.firstMs })),
    };
  },
};
