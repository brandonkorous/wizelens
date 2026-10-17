import { insightGroups, type InsightGroup, insightHeadline } from "../../stats/insights.js";
import type { Headline } from "../../stats/overview.js";
import { MODEL_LIST_MAX } from "./database.js";
import { type ModelInput, type ModelMeta, metaOf } from "./input.js";

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

/** Area, impact, and text filters. "all" or "" means no filter. */
function matches(g: InsightGroup, p: ModelInput["params"]): boolean {
  if (p.area && p.area !== "all" && g.area !== p.area) return false;
  if (p.impact && p.impact !== "all" && g.impact !== p.impact) return false;
  const q = (p.q ?? "").toLowerCase();
  return !q || `${g.title} ${g.description} ${g.shape} ${g.endpoints.join(" ")}`.toLowerCase().includes(q);
}

/** The Insights page. Params: area, impact, q, key. */
export function insightsModel(i: ModelInput): InsightsModel {
  const groups = insightGroups(i.traces);
  const prev = insightGroups(i.prevTraces);
  const visible = groups.filter((g) => matches(g, i.params));
  return {
    meta: metaOf(i),
    totals: totalsOf(groups),
    prevTotals: totalsOf(prev),
    found: insightHeadline(groups, prev, i.window),
    groups: visible.slice(0, MODEL_LIST_MAX),
    matching: visible.length,
    selected: i.params.key ? (groups.find((g) => g.key === i.params.key) ?? null) : null,
  };
}
