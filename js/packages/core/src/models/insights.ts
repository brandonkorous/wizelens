import type { PageDef } from "../scale/needs.js";
import { type InsightGroup, insightHeadline } from "../stats/insights.js";
import type { Headline } from "../stats/overview.js";
import { MODEL_LIST_MAX } from "./database.js";
import { META_NEEDS, type ModelMeta, type ModelParams, metaOf, serviceParam } from "./input.js";
import { insightGroupsOf, insightNeeds } from "./insight-groups.js";
import { uniqueNeeds } from "./read.js";

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

/** The Insights page. Params: area, impact, q, endpoint, service, key. */
export const insightsPage: PageDef<InsightsModel> = {
  needs: (ctx) => {
    const service = serviceParam(ctx.params);
    return uniqueNeeds([...META_NEEDS, ...insightNeeds("cur", "all", service), ...insightNeeds("prev", "all", service)]);
  },
  model(d) {
    const groups = insightGroupsOf(d, "cur");
    const prev = insightGroupsOf(d, "prev");
    const visible = groups.filter((g) => matches(g, d.params));
    return {
      meta: metaOf(d),
      totals: totalsOf(groups),
      prevTotals: totalsOf(prev),
      found: insightHeadline(groups, prev, d.window),
      groups: visible.slice(0, MODEL_LIST_MAX),
      matching: visible.length,
      selected: d.params.key ? (groups.find((g) => g.key === d.params.key) ?? null) : null,
    };
  },
};
