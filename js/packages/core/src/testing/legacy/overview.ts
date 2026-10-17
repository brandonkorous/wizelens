import { avgOf, percentileOf, series } from "../../stats/common.js";
import { insightGroups, type InsightGroup, insightHeadline } from "../../stats/insights.js";
import { ACTIVITY_BUCKETS, type ActivitySeries, type Headline, requestActivity, requestHeadlines, type RequestHeadlines } from "../../stats/overview.js";
import type { RequestRow } from "../../stats/requests.js";
import { serviceRows, type ServiceRow } from "../../stats/services.js";
import { type ModelInput, type ModelMeta, metaOf } from "./input.js";

export interface TimingPart {
  key: string;
  label: string;
  avg: number | null;
  p95: number | null;
  /** Shade of the bar, in percent. */
  shade: number;
}

export interface OverviewModel {
  meta: ModelMeta;
  empty: boolean;
  headlines: RequestHeadlines;
  /** Distinct insights, the same number the Insights page lists. */
  insightsFound: Headline;
  activity: ActivitySeries & { avgDuration: (number | null)[] };
  timing: TimingPart[];
  services: ServiceRow[];
  recent: RequestRow[];
  insights: InsightGroup[];
}

const PARTS: { key: string; label: string; pick: (r: RequestRow) => number | null; shade: number }[] = [
  { key: "request", label: "Request", pick: (r) => r.durationMs, shade: 100 },
  { key: "server", label: "Server", pick: (r) => r.serverMs, shade: 70 },
  { key: "database", label: "Database", pick: (r) => (r.serverMs === null ? null : r.dbMs), shade: 55 },
  { key: "render", label: "Render", pick: (r) => r.renderMs, shade: 42 },
  { key: "network", label: "Network", pick: (r) => r.networkMs, shade: 30 },
];

/** Where request time goes: average and p95 of each part. */
export function timingParts(rows: readonly RequestRow[]): TimingPart[] {
  return PARTS.map((p) => {
    const values = rows.map(p.pick).filter((v): v is number => v !== null);
    return { key: p.key, label: p.label, avg: avgOf(values), p95: percentileOf(values, 95), shade: p.shade };
  });
}

const TOP_SERVICES = 5;
const TOP_RECENT = 5;
const TOP_INSIGHTS = 3;

export function overviewModel(i: ModelInput): OverviewModel {
  const groups = insightGroups(i.traces);
  return {
    meta: metaOf(i),
    empty: i.requests.length === 0,
    headlines: requestHeadlines(i.requests, i.prevRequests, i.window),
    insightsFound: insightHeadline(groups, insightGroups(i.prevTraces), i.window),
    activity: { ...requestActivity(i.requests, i.window), avgDuration: series(i.requests, (r) => r.startMs, i.window, ACTIVITY_BUCKETS, "avg", (r) => r.durationMs) },
    timing: timingParts(i.requests),
    services: serviceRows(i.traces).slice(0, TOP_SERVICES),
    recent: i.requests.slice(0, TOP_RECENT),
    insights: groups.slice(0, TOP_INSIGHTS),
  };
}
