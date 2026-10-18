import type { Headline } from "@wizeworks/lens-core";
import type { DigestData } from "../notify/digest-data.js";
import type { DigestPeriod } from "../repo/mail-prefs.js";
import { type Block, type EmailContent, list, type Stat, stats } from "./content.js";

const WORD: Record<DigestPeriod, { noun: string; vs: string; adj: string }> = {
  daily: { noun: "day", vs: "vs the day before", adj: "daily" },
  weekly: { noun: "week", vs: "vs last week", adj: "weekly" },
  monthly: { noun: "month", vs: "vs the 30 days before", adj: "monthly" },
};

const count = (v: number | null) => (v === null ? "–" : Math.round(v).toLocaleString("en-US"));
const ms = (v: number | null) => (v === null ? "–" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
const pct = (v: number | null) => (v === null ? "–" : `${v.toFixed(v < 10 ? 1 : 0)}%`);

/** "+12% vs last week" in red when a bigger number is worse, green when it is better. `null`: neither, for traffic. */
function stat(label: string, h: Headline, show: (v: number | null) => string, vs: string, higherIsBad: boolean | null): Stat {
  if (h.change === null || h.previous === null) return { label, value: show(h.value) };
  const up = h.change > 0;
  const change = Math.abs(h.change) < 0.5 ? `same ${vs}` : `${up ? "+" : "−"}${Math.abs(Math.round(h.change))}% ${vs}`;
  const tone = Math.abs(h.change) < 0.5 || higherIsBad === null ? undefined : up === higherIsBad ? "bad" : "good";
  return { label, value: show(h.value), change, tone };
}

function lists(d: DigestData): Block[] {
  const out: Block[] = [];
  if (d.errors.length) out.push(list("Top errors", d.errors.map((e) => ({ text: `${e.type}: ${e.message}`.slice(0, 140), meta: `${count(e.count)} times` }))));
  if (d.slowest.length) out.push(list("Slowest endpoints (p95)", d.slowest.map((s) => ({ text: s.endpoint, meta: `${ms(s.p95Ms)} · ${count(s.count)} calls` }))));
  if (d.insights.length) out.push(list("Insights", d.insights.map((i) => ({ text: i.title, meta: `${count(i.occurrences)} requests` }))));
  return out;
}

export interface DigestLinks {
  project: string;
  stop: string;
}

/** One project's day, week, or month: headline numbers with their change, then errors, slow endpoints, and insights. */
export function digest(project: string, org: string, period: DigestPeriod, d: DigestData, links: DigestLinks): EmailContent {
  const w = WORD[period];
  const errorsUp = (d.errorRate.change ?? 0) >= 0.5 && (d.errorRate.value ?? 0) > 0;
  return {
    kind: "digest",
    subject: `${project}: your ${w.noun} on WizeLens (${count(d.requests.value)} requests, ${pct(d.errorRate.value)} errors)`,
    preview: `${count(d.requests.value)} requests, ${pct(d.errorRate.value)} errors, p95 ${ms(d.p95Ms)}.`,
    heading: `Your ${w.noun} in ${project}.`,
    tone: errorsUp || d.alertsFired > 0 ? "warn" : "good",
    blocks: [
      stats([
        stat("Requests", d.requests, count, w.vs, null),
        stat("Error rate", d.errorRate, pct, w.vs, true),
        stat("Average time", d.avgMs, ms, w.vs, true),
        { label: "p95 time", value: ms(d.p95Ms) },
        stat("SQL queries", d.sqlQueries, count, w.vs, true),
        { label: "Alerts fired", value: count(d.alertsFired), tone: d.alertsFired ? "bad" : undefined },
      ]),
      ...lists(d),
    ],
    action: { label: `Open ${project}`, url: links.project },
    footer: `You get the ${w.adj} digest of ${project} because you are a member of ${org}. Pick digests on your Account page.`,
    unsubscribe: { label: `Stop the ${w.adj} digest for ${project}`, url: links.stop },
  };
}
