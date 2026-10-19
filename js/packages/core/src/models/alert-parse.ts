// Checks an alert rule from a request body. Hosts pass hooks for what they check themselves: URLs, and email recipients.
import { isMetricAlertStat } from "../metrics/alert.js";
import { MAX_METRIC_NAME } from "../metrics/types.js";
import { ALERT_REMINDS_MS, ALERT_WINDOWS_MS, type AlertChannel, type AlertRuleInput, MAX_ALERT_CHANNELS } from "./alert-rule.js";
import { alertScopeProblem, isAlertMetric, isAlertOp } from "./alerts.js";

export interface AlertParseHooks {
  /** Why a webhook-style URL may not be used, or null. */
  checkUrl: (url: string) => Promise<string | null>;
  /** The email channel for these recipients, or why not; absent where the host sends no email. */
  email?: (to: unknown) => Promise<AlertChannel | string>;
}

const URL_KINDS = new Set(["webhook", "slack", "teams", "discord"]);
const ROUTING_KEY = /^[A-Za-z0-9]{20,64}$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function channelOf(c: Record<string, unknown>, hooks: AlertParseHooks): Promise<AlertChannel | string> {
  if (c.kind === "email") return hooks.email ? hooks.email(c.to) : "This host sends no email; use a webhook, Slack, Teams, Discord, or PagerDuty.";
  if (c.kind === "pagerduty") return typeof c.routingKey === "string" && ROUTING_KEY.test(c.routingKey.trim()) ? { kind: "pagerduty", routingKey: c.routingKey.trim() } : "A PagerDuty channel needs the integration's routing key (Events API v2).";
  if (!URL_KINDS.has(String(c.kind)) || typeof c.url !== "string") return "Each channel needs kind (webhook, slack, teams, discord, pagerduty, or email) and url (or routingKey, or to).";
  const problem = await hooks.checkUrl(c.url);
  return problem ? `${c.url}: ${problem}` : { kind: c.kind as "webhook", url: c.url };
}

async function channelsOf(raw: unknown, hooks: AlertParseHooks): Promise<AlertChannel[] | string> {
  if (Array.isArray(raw) && raw.length > MAX_ALERT_CHANNELS) return `A rule sends to at most ${MAX_ALERT_CHANNELS} channels.`;
  const out: AlertChannel[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    const one = await channelOf((c ?? {}) as Record<string, unknown>, hooks);
    if (typeof one === "string") return one;
    out.push(one);
  }
  return out;
}

type MetricPart = Pick<AlertRuleInput, "metric" | "metricName" | "metricStat" | "metricService">;

function metricPart(b: Record<string, unknown>): MetricPart | string {
  if (b.metric !== "metric") return isAlertMetric(b.metric) ? { metric: b.metric, metricName: "", metricStat: "", metricService: "" } : "Pick a metric: error_rate, p95_ms, avg_ms, requests, new_errors, slow_queries, or metric.";
  const name = text(b.metricName, MAX_METRIC_NAME + 1);
  if (!name || name.length > MAX_METRIC_NAME) return "Set metricName to the metric to watch, for example process.cpu.utilization.";
  const stat = b.metricStat ?? "avg";
  if (!isMetricAlertStat(stat)) return "Pick a metricStat: last, avg, max, p95, p99, or rate.";
  return { metric: "metric", metricName: name, metricStat: stat, metricService: text(b.metricService, 100) };
}

/** The rule in a body, or why it is not valid. A change sends only what it changes: merge it over the current rule first. */
export async function parseAlertRule(b: Record<string, unknown>, hooks: AlertParseHooks): Promise<AlertRuleInput | string> {
  const metric = metricPart(b);
  if (typeof metric === "string") return metric;
  if (!isAlertOp(b.op)) return 'Set op to ">", "<", ">=", or "<=".';
  const threshold = Number(b.threshold);
  if (b.threshold === null || b.threshold === "" || !Number.isFinite(threshold)) return "Set a number for threshold.";
  const windowMs = Number(b.windowMs ?? 5 * 60_000);
  if (!ALERT_WINDOWS_MS.includes(windowMs)) return "Pick a window of 5, 15, 60, 360, or 1440 minutes.";
  const remindMs = Number(b.remindMs ?? 0);
  if (!ALERT_REMINDS_MS.includes(remindMs)) return "Pick a reminder of 0 (never), 15, 60, 240, or 1440 minutes.";
  const scope = metric.metric === "metric" ? { service: "", endpoint: "" } : { service: text(b.service, 100), endpoint: text(b.endpoint, 300) };
  const scopeProblem = metric.metric === "metric" ? null : alertScopeProblem(metric.metric, scope);
  if (scopeProblem) return scopeProblem;
  const channels = await channelsOf(b.channels, hooks);
  if (typeof channels === "string") return channels;
  return { name: text(b.name, 100), ...metric, op: b.op, threshold, windowMs, env: text(b.env, 50), ...scope, channels, enabled: b.enabled !== false, remindMs };
}
