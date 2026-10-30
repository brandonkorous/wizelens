import type { ComponentType } from "react";
import { Bug, Database, GitBranch, Rocket } from "lucide-react";
import { ANOMALY_LABEL, type AnomalyMetric, causeText, type Problem, type SuspectedCause } from "@wizeworks/lens-core/internal";
import { fmtAgo, fmtCount, fmtMs, fmtPct } from "../../format";
import { hrefTo } from "../../routes";

export const CAUSE_LABEL: Record<SuspectedCause["kind"], string> = { release: "New release", error: "New error", query: "Query", downstream: "Downstream service" };

export const CAUSE_ICON: Record<SuspectedCause["kind"], ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = { release: Rocket, error: Bug, query: Database, downstream: GitBranch };

/** Where a cause leads: the service, the error group, or the database that ran the query. */
export function causeHref(c: SuspectedCause): string {
  if (c.kind === "error") return hrefTo("errors", [], { group: c.key });
  if (c.kind === "release") return hrefTo("services", [c.service]);
  return hrefTo("services", [c.row]);
}

/** One cause: an icon, what kind it is, and the sentence, linked to where to look next. */
export function CauseLine({ cause }: { cause: SuspectedCause }) {
  const Icon = CAUSE_ICON[cause.kind];
  return (
    <a className="wl-pb-cause" href={causeHref(cause)}>
      <Icon size={15} aria-hidden={true} />
      <strong>{CAUSE_LABEL[cause.kind]}</strong>
      <span>{causeText(cause)}</span>
    </a>
  );
}

/** A metric value as people read it: a percent, a duration, or requests per minute. */
export function fmtMetric(metric: AnomalyMetric, v: number | null, bucketMs: number): string {
  if (v === null) return "–";
  if (metric === "error_rate") return fmtPct(v);
  if (metric === "p95_ms") return fmtMs(v);
  return `${fmtCount(v / Math.max(bucketMs / 60_000, 1e-9))}/min`;
}

/** The value per bucket in the unit `fmtMetric` shows: requests become per minute. */
export const perShown = (metric: AnomalyMetric, values: readonly (number | null)[], bucketMs: number): (number | null)[] =>
  metric === "requests" ? values.map((v) => (v === null ? null : v / Math.max(bucketMs / 60_000, 1e-9))) : [...values];

export const metricLabel = (m: AnomalyMetric): string => ANOMALY_LABEL[m];

/** "Started 12 min ago · 20 min · ongoing", or how long it lasted and when it ended. */
export function whenText(p: Problem, now: number): string {
  const minutes = Math.max(1, Math.round((Math.min(p.endMs, now) - p.startMs) / 60_000));
  const lasted = minutes >= 120 ? `${Math.round(minutes / 60)} h` : `${minutes} min`;
  return `Started ${fmtAgo(p.startMs, now)} · ${lasted}${p.ongoing ? " · ongoing" : ` · ended ${fmtAgo(p.endMs, now)}`}`;
}

export const problemHref = (p: Problem): string => hrefTo("problems", [p.id]);
