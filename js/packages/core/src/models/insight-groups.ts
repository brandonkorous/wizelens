// Insight groups from rollups: request insights (ins, ins.ep) plus route and component insights, like `insightGroups`.
import { type Agg } from "../scale/agg.js";
import { splitKey } from "../scale/kinds.js";
import type { Need, NeedResults, WindowRef } from "../scale/needs.js";
import { compareInsights, type InsightGroup, insightGroupOf, type InsightHit } from "../stats/insights.js";
import { componentInsight, routeInsight } from "../stats/rendering.js";
import { byDesc, groupNeed, rowsOf } from "./read.js";
import { componentNeeds, componentRowsOf, routeNeeds, routeRowsOf } from "./render-rows.js";

/** "all" insights, or only the request ones (database and http). */
export type InsightScope = "all" | "requests";

const ids = (win: WindowRef) => ({ ins: `ig.${win}.ins`, ep: `ig.${win}.ins.ep` });

/** Needs for the insight groups of one window. */
export function insightNeeds(win: WindowRef, scope: InsightScope = "all"): Need[] {
  const id = ids(win);
  const requests = [groupNeed(id.ins, "ins", win, { top: true }), groupNeed(id.ep, "ins.ep", win)];
  return scope === "requests" ? requests : [...requests, ...routeNeeds(win), ...componentNeeds(win)];
}

type InsightTop = Pick<InsightHit, "kind" | "shape" | "endpoint" | "traceId" | "startMs">;

/** Endpoints per insight group key, newest first. */
function endpointsByGroup(d: NeedResults, id: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { key } of [...rowsOf(d, id)].sort(byDesc((r) => r.agg.lastMs))) {
    const [group = "", endpoint = ""] = splitKey(key);
    out.set(group, [...(out.get(group) ?? []), endpoint]);
  }
  return out;
}

function requestGroup(key: string, a: Agg, endpoints: string[]): InsightGroup {
  const top = a.top as InsightTop;
  const summary = { kind: top.kind, shape: top.shape, occurrences: a.n, count: a.c[0] ?? 0, totalMs: a.sum, lastSeenMs: a.lastMs, exampleTraceId: top.traceId };
  return insightGroupOf(key, { ...summary, endpoints: endpoints.length ? endpoints : [top.endpoint] });
}

/** Request insight groups, newest first (the order `insightGroups` meets them in). */
function requestGroups(d: NeedResults, win: WindowRef): InsightGroup[] {
  const id = ids(win);
  const endpoints = endpointsByGroup(d, id.ep);
  return [...rowsOf(d, id.ins)].sort(byDesc((r) => r.agg.lastMs)).map((r) => requestGroup(r.key, r.agg, endpoints.get(r.key) ?? []));
}

/** The insight groups of a window, most important first. */
export function insightGroupsOf(d: NeedResults, win: WindowRef, scope: InsightScope = "all"): InsightGroup[] {
  const requests = requestGroups(d, win);
  if (scope === "requests") return requests.sort(compareInsights);
  const routes = routeRowsOf(d, win).filter((r) => r.issue !== "none").map(routeInsight);
  const components = componentRowsOf(d, win).filter((c) => c.issues.length > 0).map(componentInsight);
  return [...requests, ...routes, ...components].sort(compareInsights);
}
