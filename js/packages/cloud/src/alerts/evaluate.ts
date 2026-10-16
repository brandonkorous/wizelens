import { alertBreached, alertMessage, alertValue, metricAlertMessage, metricAlertUnit, metricAlertValue } from "@wizeworks/lens-core";
import type { CloudApp } from "../app.js";
import { addEvent, type AlertRule, enabledRules, saveEvaluation } from "../repo/alerts.js";
import { loadMetricPoints } from "../repo/metric-read.js";
import { findTraceIds, loadTraces } from "../repo/trace-read.js";
import { deliver, type Notice } from "./notify.js";

/** Names for the notice: project and the dashboard link. */
async function noticeOf(app: CloudApp, rule: AlertRule, state: Notice["state"], value: number | null, now: number): Promise<Notice> {
  const [p] = await app.db.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [rule.projectId]);
  const base = app.config.publicUrl ?? `http://localhost:${app.config.port}`;
  return {
    rule: rule.name,
    project: p?.name ?? rule.projectId,
    state,
    message: await messageOf(app, rule, value, now),
    value,
    threshold: rule.threshold,
    timeMs: now,
    url: `${base}/_wizelens/#/alerts?project=${rule.projectId}`,
  };
}

/** One OpenTelemetry metric over the rule's window, and a sample point for its unit. */
async function measureMetric(app: CloudApp, rule: AlertRule, now: number) {
  const q = { projectId: rule.projectId, from: now - rule.windowMs, to: now, env: rule.env || undefined, name: rule.metricName, service: rule.metricService || undefined };
  const { points } = await loadMetricPoints(app.db, { ...q, limit: app.config.maxMetricPoints });
  const stat = rule.metricStat || "avg";
  return { value: metricAlertValue(points, { from: q.from, to: q.to }, stat), sample: points[0], stat };
}

async function messageOf(app: CloudApp, rule: AlertRule, value: number | null, now: number): Promise<string> {
  if (rule.metric !== "metric") return alertMessage(rule.metric, rule.op, value, rule.threshold);
  const { sample, stat } = await measureMetric(app, rule, now);
  const unit = sample ? metricAlertUnit(sample, stat) : "";
  return metricAlertMessage(rule.metricName, stat, rule.op, value, rule.threshold, unit);
}

/** The metric over the rule's window: from the traces that started in it, or from the metric's points. */
async function measure(app: CloudApp, rule: AlertRule, now: number): Promise<number | null> {
  if (rule.metric === "metric") return (await measureMetric(app, rule, now)).value;
  const limit = app.config.maxStatsTraces;
  const env = rule.env || undefined;
  const load = async (from: number, to: number) =>
    loadTraces(app.db, rule.projectId, await findTraceIds(app.db, { projectId: rule.projectId, from, before: to, env, limit }));
  const traces = await load(now - rule.windowMs, now);
  const prev = rule.metric === "new_errors" ? await load(now - 2 * rule.windowMs, now - rule.windowMs) : [];
  return alertValue(rule.metric, traces, prev);
}

/** Send a notice and keep it as an event. */
export async function notify(app: CloudApp, rule: AlertRule, state: Notice["state"], value: number | null, now: number): Promise<string> {
  const notice = await noticeOf(app, rule, state, value, now);
  const delivery = await deliver(rule.channels, notice, app.config.fetch, app.config.allowPrivateWebhooks);
  await addEvent(app.db, rule, { kind: state, value, message: notice.message, timeMs: now, delivery });
  return delivery;
}

/** Check one rule. It notifies only when the state changes: ok to firing, or firing to ok. */
export async function evaluateRule(app: CloudApp, rule: AlertRule, now: number): Promise<void> {
  const value = await measure(app, rule, now);
  const firing = rule.metric === "metric" ? value !== null && (rule.op === ">" ? value > rule.threshold : value < rule.threshold) : alertBreached(rule.metric, rule.op, value, rule.threshold);
  const next = firing ? "firing" : "ok";
  await saveEvaluation(app.db, rule.id, next, value, now);
  if (next !== rule.state) await notify(app, rule, firing ? "fired" : "resolved", value, now);
}

/** Check every enabled rule once. One failing rule does not stop the others. */
export async function evaluateAll(app: CloudApp): Promise<void> {
  const now = app.config.now();
  for (const rule of await enabledRules(app.db)) {
    await evaluateRule(app, rule, now).catch((err: unknown) => console.error(`[wizelens-cloud] alert ${rule.id} failed:`, err));
  }
}
