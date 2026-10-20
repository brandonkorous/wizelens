// Checks an alert rule from a request body. Hosts pass hooks for what they check themselves: URLs, and email recipients.
import { DEFAULT_SPREADS, isAnomalyMetric } from "../anomaly/baseline.js";
import { isMetricAlertStat } from "../metrics/alert.js";
import { MAX_METRIC_NAME } from "../metrics/types.js";
import { cleanSearchParams } from "./log-search.js";
import { ALERT_REMINDS_MS, ALERT_WINDOWS_MS, type AlertChannel, type AlertRuleInput, MAX_ALERT_CHANNELS } from "./alert-rule.js";
import { type AlertMetric, alertScopeProblem, isAlertMetric, isAlertOp } from "./alerts.js";

export interface AlertParseHooks {
  /** Why a webhook-style URL may not be used, or null. */
  checkUrl: (url: string) => Promise<string | null>;
  /** Why an SLO id may not be used (it does not exist in the project), or null. */
  checkSlo?: (id: string) => Promise<string | null>;
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

type MetricPart = Pick<AlertRuleInput, "metric" | "metricName" | "metricStat" | "metricService" | "sloId" | "logSearch">;
const NO_METRIC = { metricName: "", metricStat: "" as const, metricService: "", sloId: "", logSearch: {} };

async function metricPart(b: Record<string, unknown>, hooks: AlertParseHooks): Promise<MetricPart | string> {
  if (b.metric === "slo") {
    const sloId = text(b.sloId, 100);
    const problem = !sloId ? "Set sloId to the SLO whose burn rate to watch." : hooks.checkSlo ? await hooks.checkSlo(sloId) : "This host keeps no SLOs.";
    return problem ?? { metric: "slo", ...NO_METRIC, sloId };
  }
  if (b.metric === "log_count") return { metric: "log_count", ...NO_METRIC, logSearch: cleanSearchParams(b.logSearch) };
  if (b.metric !== "metric") return isAlertMetric(b.metric) ? { metric: b.metric, ...NO_METRIC } : "Pick a metric: error_rate, p95_ms, avg_ms, requests, new_errors, slow_queries, log_count, new_security_risks, metric, or slo.";
  const name = text(b.metricName, MAX_METRIC_NAME + 1);
  if (!name || name.length > MAX_METRIC_NAME) return "Set metricName to the metric to watch, for example process.cpu.utilization.";
  const stat = b.metricStat ?? "avg";
  if (!isMetricAlertStat(stat)) return "Pick a metricStat: last, avg, max, p95, p99, or rate.";
  return { metric: "metric", metricName: name, metricStat: stat, metricService: text(b.metricService, 100), sloId: "", logSearch: {} };
}

/** The op and threshold, or why not. "Above normal" works on the metrics with a baseline; its threshold is how many spreads above normal (2 high, 3 medium, 4 low). */
function lineOf(b: Record<string, unknown>, metric: MetricPart["metric"]): Pick<AlertRuleInput, "op" | "threshold"> | string {
  if (!isAlertOp(b.op)) return 'Set op to ">", "<", ">=", "<=", or "above_normal".';
  const above = b.op === "above_normal";
  const raw = above && (b.threshold === undefined || b.threshold === null || b.threshold === "") ? DEFAULT_SPREADS : b.threshold;
  const threshold = Number(raw);
  if (raw === null || raw === "" || !Number.isFinite(threshold)) return "Set a number for threshold.";
  if (above && !isAnomalyMetric(metric)) return "Above normal works with error_rate, p95_ms, or requests.";
  if (above && (threshold < 1 || threshold > 10)) return "For above normal, set threshold to the sensitivity: 2 (high), 3 (medium), or 4 (low), or any number from 1 to 10.";
  return { op: b.op as AlertRuleInput["op"], threshold };
}

/** The rule in a body, or why it is not valid. A change sends only what it changes: merge it over the current rule first. */
export async function parseAlertRule(b: Record<string, unknown>, hooks: AlertParseHooks): Promise<AlertRuleInput | string> {
  const metric = await metricPart(b, hooks);
  if (typeof metric === "string") return metric;
  const line = lineOf(b, metric.metric);
  if (typeof line === "string") return line;
  const windowMs = Number(b.windowMs ?? 5 * 60_000);
  if (!ALERT_WINDOWS_MS.includes(windowMs)) return "Pick a window of 5, 15, 60, 360, or 1440 minutes.";
  const remindMs = Number(b.remindMs ?? 0);
  if (!ALERT_REMINDS_MS.includes(remindMs)) return "Pick a reminder of 0 (never), 15, 60, 240, or 1440 minutes.";
  const traceRule = metric.metric !== "metric" && metric.metric !== "slo";
  const scope = traceRule ? { service: text(b.service, 100), endpoint: text(b.endpoint, 300) } : { service: "", endpoint: "" };
  const scopeProblem = traceRule ? alertScopeProblem(metric.metric as AlertMetric, scope) : null;
  if (scopeProblem) return scopeProblem;
  const channels = await channelsOf(b.channels, hooks);
  if (typeof channels === "string") return channels;
  return { name: text(b.name, 100), ...metric, ...line, windowMs, env: text(b.env, 50), ...scope, channels, enabled: b.enabled !== false, remindMs };
}
