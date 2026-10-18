import { alertBreached, alignNow, alertContext, alertMessage, alertPage, computePage, metricAlertMessage, metricAlertUnit, metricAlertValueOf } from "@wizeworks/lens-core";
import type { CloudApp } from "../app.js";
import { addEvent, type AlertRule, enabledRules, saveEvaluation } from "../repo/alerts.js";
import { loadMetricAlertData } from "../repo/metric-read.js";
import { cloudExecutor, projectRetentionMs } from "../scale-exec.js";
import { alertMail } from "../mail/templates.js";
import { memberEmails } from "../repo/users.js";
import { deliver, type Notice, type Outbox } from "./notify.js";

/** Names for the notice: project and the dashboard link. */
async function noticeOf(app: CloudApp, rule: AlertRule, state: Notice["state"], value: number | null, now: number): Promise<Notice> {
  const [p] = await app.db.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [rule.projectId]);
  const base = app.baseUrl();
  return {
    rule: rule.name,
    project: p?.name ?? rule.projectId,
    state,
    message: await messageOf(app, rule, state, value, now),
    value,
    threshold: rule.threshold,
    timeMs: now,
    url: `${base}/_wizelens/#/alerts?project=${rule.projectId}`,
  };
}

/** One OpenTelemetry metric over the rule's window (from its rollups), and a sample series for its unit. */
async function measureMetric(app: CloudApp, rule: AlertRule, now: number) {
  const at = alignNow(now);
  const q = { projectId: rule.projectId, env: rule.env || undefined, service: rule.metricService || undefined };
  const data = await loadMetricAlertData(app.db, q, rule.metricName, { from: at - rule.windowMs, to: at }, at);
  const stat = rule.metricStat || "avg";
  return { value: metricAlertValueOf(data, stat), sample: data.series[0], stat };
}

async function messageOf(app: CloudApp, rule: AlertRule, state: Notice["state"], value: number | null, now: number): Promise<string> {
  if (rule.metric !== "metric") return alertMessage(rule.metric, rule.op, value, rule.threshold, state);
  const { sample, stat } = await measureMetric(app, rule, now);
  const unit = sample ? metricAlertUnit(sample, stat) : "";
  return metricAlertMessage(rule.metricName, stat, rule.op, value, rule.threshold, unit, state);
}

/** The metric over the rule's window: from the stats tables, or from the metric's points. */
async function measure(app: CloudApp, rule: AlertRule, now: number): Promise<number | null> {
  if (rule.metric === "metric") return (await measureMetric(app, rule, now)).value;
  const retentionMs = await projectRetentionMs(app.db, rule.projectId, app.config.retentionDays);
  return computePage(alertPage(rule.metric), alertContext(rule.windowMs, alignNow(now)), cloudExecutor(app.db, rule.projectId, retentionMs, rule.env || undefined));
}

/** Webhooks, Slack, and email. Email goes only to addresses that still belong to confirmed members of the organization. */
async function outboxOf(app: CloudApp, projectId: string): Promise<Outbox> {
  const [p] = await app.db.query<{ org_id: string }>("SELECT org_id FROM projects WHERE id = $1", [projectId]);
  const members = new Set(p ? await memberEmails(app.db, p.org_id, app.mailer.live) : []);
  const email = (to: readonly string[], n: Notice) => {
    const ok = to.filter((e) => members.has(e));
    for (const addr of ok) app.mailer.send(alertMail(addr, n));
    const note = app.mailer.live ? `sent to ${ok.length}` : "mail is not set up (see the cloud log)";
    return `email: ${note}${ok.length < to.length ? `, ${to.length - ok.length} no longer members` : ""}`;
  };
  return { http: app.config.fetch, allowPrivate: app.config.allowPrivateWebhooks, email };
}

/** Send a notice and keep it as an event. */
export async function notify(app: CloudApp, rule: AlertRule, state: Notice["state"], value: number | null, now: number): Promise<string> {
  const notice = await noticeOf(app, rule, state, value, now);
  const delivery = await deliver(rule.channels, notice, await outboxOf(app, rule.projectId));
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
