import {
  alertBreached,
  alertContext,
  alertMessage,
  type AlertNoticeState,
  alertPage,
  type AlertRule,
  alertStep,
  alignNow,
  computePage,
  metricAlertMessage,
  metricAlertUnit,
  metricAlertValueOf,
  opHolds,
} from "@wizeworks/lens-core";
import { deliver, type Notice, type Outbox } from "@wizeworks/lens-hub/kit";
import type { CloudApp } from "../app.js";
import { alertMail } from "../mail/templates.js";
import { addEvent } from "../repo/alert-events.js";
import { enabledRules, saveEvaluation } from "../repo/alerts.js";
import { memberEmails } from "../repo/users.js";
import { projectRetentionMs } from "../scale-exec.js";

/** Names for the notice: project and the link to the rule's page. */
async function noticeOf(app: CloudApp, rule: AlertRule, state: AlertNoticeState, value: number | null, now: number): Promise<Notice> {
  const [p] = await app.db.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [rule.projectId]);
  return {
    ruleId: rule.id,
    rule: rule.name,
    project: p?.name ?? rule.projectId,
    state,
    message: await messageOf(app, rule, state, value, now),
    value,
    threshold: rule.threshold,
    timeMs: now,
    url: `${app.baseUrl()}/_wizelens/#/alerts/${rule.id}?project=${rule.projectId}`,
  };
}

/** One OpenTelemetry metric over the rule's window (from its rollups), and a sample series for its unit. */
async function measureMetric(app: CloudApp, rule: AlertRule, now: number) {
  const at = alignNow(now);
  const q = { projectId: rule.projectId, env: rule.env || undefined, service: rule.metricService || undefined };
  const data = await app.telemetry.metricAlertData(q, rule.metricName, { from: at - rule.windowMs, to: at }, at);
  const stat = rule.metricStat || "avg";
  return { value: metricAlertValueOf(data, stat), sample: data.series[0], stat };
}

async function messageOf(app: CloudApp, rule: AlertRule, state: AlertNoticeState, value: number | null, now: number): Promise<string> {
  if (rule.metric !== "metric") return alertMessage(rule.metric, rule.op, value, rule.threshold, state);
  const { sample, stat } = await measureMetric(app, rule, now);
  const unit = sample ? metricAlertUnit(sample, stat) : "";
  return metricAlertMessage(rule.metricName, stat, rule.op, value, rule.threshold, unit, state);
}

/** The metric over the rule's window: from the stats tables (one service or endpoint when scoped), or from the metric's points. */
async function measure(app: CloudApp, rule: AlertRule, now: number): Promise<number | null> {
  if (rule.metric === "metric") return (await measureMetric(app, rule, now)).value;
  const retentionMs = await projectRetentionMs(app.db, rule.projectId, app.config.retentionDays);
  const page = alertPage(rule.metric, { service: rule.service, endpoint: rule.endpoint });
  return computePage(page, alertContext(rule.windowMs, alignNow(now)), app.telemetry.executor(rule.projectId, retentionMs, rule.env || undefined));
}

/** Webhooks, chat, PagerDuty, and email. Email goes only to addresses that still belong to confirmed members of the organization. */
async function outboxOf(app: CloudApp, projectId: string): Promise<Outbox> {
  const [p] = await app.db.query<{ org_id: string }>("SELECT org_id FROM projects WHERE id = $1", [projectId]);
  const members = new Set(p ? await memberEmails(app.db, p.org_id, app.mailer.live) : []);
  const email = (to: readonly string[], n: Notice) => {
    const ok = to.filter((e) => members.has(e));
    for (const addr of ok) app.mailer.send(alertMail(addr, n));
    const note = app.mailer.live ? `sent to ${ok.length}` : "mail is not set up (see the cloud log)";
    return `email: ${note}${ok.length < to.length ? `, ${to.length - ok.length} no longer members` : ""}`;
  };
  return { http: app.config.fetch, allowPrivate: app.config.allowPrivateWebhooks, email, pagerDutyUrl: app.config.pagerDutyUrl };
}

/** Send a notice and keep it as an event. */
export async function notify(app: CloudApp, rule: AlertRule, state: AlertNoticeState, value: number | null, now: number): Promise<string> {
  const notice = await noticeOf(app, rule, state, value, now);
  const delivery = await deliver(rule.channels, notice, await outboxOf(app, rule.projectId));
  await addEvent(app.db, rule, { kind: state, value, message: notice.message, timeMs: now, delivery });
  return delivery;
}

/** True when the value breaks the rule. */
export const breaches = (rule: AlertRule, value: number | null): boolean =>
  rule.metric === "metric" ? value !== null && opHolds(rule.op, value, rule.threshold) : alertBreached(rule.metric, rule.op, value, rule.threshold);

/** Check one rule: keep its value, and send a notice when it starts or stops firing, or a reminder while it keeps firing. */
export async function evaluateRule(app: CloudApp, rule: AlertRule, now: number): Promise<void> {
  const value = await measure(app, rule, now);
  const step = alertStep(rule, breaches(rule, value), now);
  await saveEvaluation(app.db, rule, { state: step.state, ackMs: step.ackMs, notified: step.notice !== null }, value, now);
  if (step.notice) await notify(app, rule, step.notice, value, now);
}

/** Check every enabled rule once. One failing rule does not stop the others. */
export async function evaluateAll(app: CloudApp): Promise<void> {
  const now = app.config.now();
  for (const rule of await enabledRules(app.db)) {
    await evaluateRule(app, rule, now).catch((err: unknown) => console.error(`[wizelens-cloud] alert ${rule.id} failed:`, err));
  }
}
