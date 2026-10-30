import {
  alertBreached,
  alertContext,
  alertMessage,
  type AlertNoticeState,
  alertPage,
  type AlertRule,
  alertStep,
  alignNow,
  type AnomalyAlertValue,
  anomalyAlertMessage,
  anomalyAlertPage,
  type AnomalyMetric,
  computePage,
  metricAlertMessage,
  metricAlertUnit,
  metricAlertValueOf,
  opHolds,
  sloBurnMessage,
  sloBurnPage,
  sloContext,
} from "@wizeworks/lens-core";
import { deliver, type Notice, type Outbox } from "@wizeworks/lens-hub/kit";
import type { CloudApp } from "../app.js";
import { alertMail } from "../mail/templates.js";
import { addEvent } from "../repo/alert-events.js";
import { enabledRules, saveEvaluation } from "../repo/alerts.js";
import { zonesOf } from "../repo/mail-prefs.js";
import { sloById } from "../repo/slos.js";
import { memberEmails } from "../repo/users.js";
import { projectRetentionMs, projectScopeOf } from "../scale-exec.js";
import { problemFor } from "./problem-link.js";

/** Names for the notice: project, the link to the rule's page, and for a firing rule the problem it is part of. */
async function noticeOf(app: CloudApp, rule: AlertRule, state: AlertNoticeState, value: number | null, now: number, anomaly?: AnomalyAlertValue): Promise<Notice> {
  const [p] = await app.db.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [rule.projectId]);
  const above = rule.op === "above_normal" ? (anomaly ?? (await measureAnomaly(app, rule, now))) : null;
  const breach = above?.breach ?? null;
  return {
    ruleId: rule.id,
    rule: rule.name,
    project: p?.name ?? rule.projectId,
    state,
    message: above ? anomalyAlertMessage(rule.metric as AnomalyMetric, above, state) : await messageOf(app, rule, state, value, now),
    value,
    threshold: rule.threshold,
    timeMs: now,
    url: `${app.baseUrl()}/_wizelens/#/alerts/${rule.id}?project=${rule.projectId}`,
    baseline: breach ? { normal: breach.normal, upper: breach.upper } : null,
    problem: state === "fired" || state === "remind" ? await problemFor(app, rule, now, breach?.row ?? null) : null,
  };
}

/** One OpenTelemetry metric over the rule's window (from its rollups), and a sample series for its unit. */
async function measureMetric(app: CloudApp, rule: AlertRule, now: number) {
  const at = alignNow(now);
  const q = { scope: await projectScopeOf(app.db, rule.projectId), env: rule.env || undefined, service: rule.metricService || undefined };
  const data = await app.telemetry.metricAlertData(q, rule.metricName, { from: at - rule.windowMs, to: at }, at);
  const stat = rule.metricStat || "avg";
  return { value: metricAlertValueOf(data, stat), sample: data.series[0], stat };
}

async function messageOf(app: CloudApp, rule: AlertRule, state: AlertNoticeState, value: number | null, now: number): Promise<string> {
  if (rule.metric === "slo") return sloBurnMessage((await sloById(app.db, rule.projectId, rule.sloId))?.name ?? rule.sloId, rule.op, value, rule.threshold, state);
  if (rule.metric !== "metric") return alertMessage(rule.metric, rule.op, value, rule.threshold, state, rule.logSearch);
  const { sample, stat } = await measureMetric(app, rule, now);
  const unit = sample ? metricAlertUnit(sample, stat) : "";
  return metricAlertMessage(rule.metricName, stat, rule.op, value, rule.threshold, unit, state);
}

async function executorOf(app: CloudApp, rule: AlertRule, env = rule.env) {
  const retentionMs = await projectRetentionMs(app.db, rule.projectId, app.config.retentionDays);
  return app.telemetry.executor(await projectScopeOf(app.db, rule.projectId), retentionMs, env || undefined);
}

/** An "above normal" rule: every service and endpoint over the window against the same window in earlier weeks (or days). */
async function measureAnomaly(app: CloudApp, rule: AlertRule, now: number): Promise<AnomalyAlertValue> {
  const page = anomalyAlertPage(rule.metric as AnomalyMetric, rule.threshold);
  return computePage(page, alertContext(rule.windowMs, alignNow(now)), await executorOf(app, rule));
}

/** The metric over the rule's window: from the stats tables (one service or endpoint when scoped, or a log search), or from the metric's points. */
async function measure(app: CloudApp, rule: AlertRule, now: number): Promise<number | null> {
  if (rule.metric === "metric") return (await measureMetric(app, rule, now)).value;
  if (rule.metric === "slo") {
    const slo = await sloById(app.db, rule.projectId, rule.sloId);
    return slo ? computePage(sloBurnPage(slo), sloContext(rule.windowMs, alignNow(now)), await executorOf(app, rule, "")) : null;
  }
  const page = alertPage(rule.metric, { service: rule.service, endpoint: rule.endpoint }, rule.logSearch);
  return computePage(page, alertContext(rule.windowMs, alignNow(now)), await executorOf(app, rule));
}

/** Webhooks, chat, PagerDuty, and email. Email goes only to addresses that still belong to confirmed members of the organization. */
async function outboxOf(app: CloudApp, projectId: string): Promise<Outbox> {
  const [p] = await app.db.query<{ org_id: string }>("SELECT org_id FROM projects WHERE id = $1", [projectId]);
  const members = new Set(p ? await memberEmails(app.db, p.org_id, app.mailer.live) : []);
  const zones = await zonesOf(app.db, [...members]);
  const email = (to: readonly string[], n: Notice) => {
    const ok = to.filter((e) => members.has(e));
    for (const addr of ok) app.mailer.send(alertMail(addr, n, zones.get(addr.toLowerCase())));
    const note = app.mailer.live ? `sent to ${ok.length}` : "mail is not set up (see the cloud log)";
    return `email: ${note}${ok.length < to.length ? `, ${to.length - ok.length} no longer members` : ""}`;
  };
  return { http: app.config.fetch, allowPrivate: app.config.allowPrivateTargets, email, pagerDutyUrl: app.config.pagerDutyUrl };
}

/** Send a notice and keep it as an event, with the problem it names. */
export async function notify(app: CloudApp, rule: AlertRule, state: AlertNoticeState, value: number | null, now: number, anomaly?: AnomalyAlertValue): Promise<string> {
  const notice = await noticeOf(app, rule, state, value, now, anomaly);
  const delivery = await deliver(rule.channels, notice, await outboxOf(app, rule.projectId));
  const problem = notice.problem ? { id: notice.problem.id, title: notice.problem.title, url: notice.problem.url } : null;
  await addEvent(app.db, rule, { kind: state, value, message: notice.message, timeMs: now, delivery, problem });
  return delivery;
}

/** True when the value breaks the rule. */
export const breaches = (rule: AlertRule, value: number | null): boolean =>
  rule.metric === "metric" || rule.metric === "slo" ? value !== null && opHolds(rule.op, value, rule.threshold) : alertBreached(rule.metric, rule.op, value, rule.threshold);

/** Whether a rule breaks now, and for "above normal" rules what broke it. */
async function verdictOf(app: CloudApp, rule: AlertRule, now: number): Promise<{ breached: boolean; value: number | null; anomaly?: AnomalyAlertValue }> {
  if (rule.op === "above_normal") {
    const anomaly = await measureAnomaly(app, rule, now);
    return { breached: anomaly.breach !== null, value: anomaly.value, anomaly };
  }
  const value = await measure(app, rule, now);
  return { breached: breaches(rule, value), value };
}

/** Check one rule: keep its value, and send a notice when it starts or stops firing, or a reminder while it keeps firing. */
export async function evaluateRule(app: CloudApp, rule: AlertRule, now: number): Promise<void> {
  const { breached, value, anomaly } = await verdictOf(app, rule, now);
  const step = alertStep(rule, breached, now);
  await saveEvaluation(app.db, rule, { state: step.state, ackMs: step.ackMs, notified: step.notice !== null }, value, now);
  if (step.notice) await notify(app, rule, step.notice, value, now, anomaly);
}

/** Check every enabled rule once. One failing rule does not stop the others. */
export async function evaluateAll(app: CloudApp): Promise<void> {
  const now = app.config.now();
  for (const rule of await enabledRules(app.db)) {
    await evaluateRule(app, rule, now).catch((err: unknown) => console.error(`[wizelens-cloud] alert ${rule.id} failed:`, err));
  }
}
