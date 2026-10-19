import {
  alertBreached, alignNow, alertContext, alertMessage, alertPage, type AnomalyAlertValue, anomalyAlertMessage, anomalyAlertPage, type AnomalyMetric, computePage, metricAlertMessage, metricAlertUnit, metricAlertValueOf,
} from "@wizeworks/lens-core";
import type { CloudApp } from "../app.js";
import { addEvent, type AlertRule, enabledRules, saveEvaluation } from "../repo/alerts.js";
import { projectRetentionMs } from "../scale-exec.js";
import { alertMail } from "../mail/templates.js";
import { memberEmails } from "../repo/users.js";
import { deliver, type Notice, type Outbox } from "./notify.js";
import { problemFor } from "./problem-link.js";

/** Names for the notice: project, the dashboard link, and for a firing rule the problem it is part of. */
async function noticeOf(app: CloudApp, rule: AlertRule, state: Notice["state"], value: number | null, now: number, anomaly?: AnomalyAlertValue): Promise<Notice> {
  const [p] = await app.db.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [rule.projectId]);
  const above = rule.op === "above_normal" ? (anomaly ?? (await measureAnomaly(app, rule, now))) : null;
  const breach = above?.breach ?? null;
  return {
    rule: rule.name,
    project: p?.name ?? rule.projectId,
    state,
    message: above ? anomalyAlertMessage(rule.metric as AnomalyMetric, above, state) : await messageOf(app, rule, state, value, now),
    value,
    threshold: rule.threshold,
    timeMs: now,
    url: `${app.baseUrl()}/_wizelens/#/alerts?project=${rule.projectId}`,
    baseline: breach ? { normal: breach.normal, upper: breach.upper } : null,
    problem: state === "fired" ? await problemFor(app, rule, now, breach?.row ?? null) : null,
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

async function messageOf(app: CloudApp, rule: AlertRule, state: Notice["state"], value: number | null, now: number): Promise<string> {
  if (rule.metric !== "metric") return alertMessage(rule.metric, rule.op, value, rule.threshold, state);
  const { sample, stat } = await measureMetric(app, rule, now);
  const unit = sample ? metricAlertUnit(sample, stat) : "";
  return metricAlertMessage(rule.metricName, stat, rule.op === "<" ? "<" : ">", value, rule.threshold, unit, state);
}

async function executorOf(app: CloudApp, rule: AlertRule) {
  const retentionMs = await projectRetentionMs(app.db, rule.projectId, app.config.retentionDays);
  return app.telemetry.executor(rule.projectId, retentionMs, rule.env || undefined);
}

/** An "above normal" rule: every service and endpoint over the window against the same window in earlier weeks (or days). */
async function measureAnomaly(app: CloudApp, rule: AlertRule, now: number): Promise<AnomalyAlertValue> {
  const page = anomalyAlertPage(rule.metric as AnomalyMetric, rule.threshold);
  return computePage(page, alertContext(rule.windowMs, alignNow(now)), await executorOf(app, rule));
}

/** The metric over the rule's window: from the stats tables, or from the metric's points. */
async function measure(app: CloudApp, rule: AlertRule, now: number): Promise<number | null> {
  if (rule.metric === "metric") return (await measureMetric(app, rule, now)).value;
  return computePage(alertPage(rule.metric), alertContext(rule.windowMs, alignNow(now)), await executorOf(app, rule));
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

/** Send a notice and keep it as an event, with the problem it names. */
export async function notify(app: CloudApp, rule: AlertRule, state: Notice["state"], value: number | null, now: number, anomaly?: AnomalyAlertValue): Promise<string> {
  const notice = await noticeOf(app, rule, state, value, now, anomaly);
  const delivery = await deliver(rule.channels, notice, await outboxOf(app, rule.projectId));
  const problem = notice.problem ? { id: notice.problem.id, title: notice.problem.title, url: notice.problem.url } : null;
  await addEvent(app.db, rule, { kind: state, value, message: notice.message, timeMs: now, delivery, problem });
  return delivery;
}

/** Whether a rule breaks now, and for "above normal" rules what broke it. */
async function verdictOf(app: CloudApp, rule: AlertRule, now: number): Promise<{ firing: boolean; value: number | null; anomaly?: AnomalyAlertValue }> {
  if (rule.op === "above_normal") {
    const anomaly = await measureAnomaly(app, rule, now);
    return { firing: anomaly.breach !== null, value: anomaly.value, anomaly };
  }
  const value = await measure(app, rule, now);
  const firing = rule.metric === "metric" ? value !== null && (rule.op === ">" ? value > rule.threshold : value < rule.threshold) : alertBreached(rule.metric, rule.op, value, rule.threshold);
  return { firing, value };
}

/** Check one rule. It notifies only when the state changes: ok to firing, or firing to ok. */
export async function evaluateRule(app: CloudApp, rule: AlertRule, now: number): Promise<void> {
  const { firing, value, anomaly } = await verdictOf(app, rule, now);
  const next = firing ? "firing" : "ok";
  await saveEvaluation(app.db, rule.id, next, value, now);
  if (next !== rule.state) await notify(app, rule, firing ? "fired" : "resolved", value, now, anomaly);
}

/** Check every enabled rule once. One failing rule does not stop the others. */
export async function evaluateAll(app: CloudApp): Promise<void> {
  const now = app.config.now();
  for (const rule of await enabledRules(app.db)) {
    await evaluateRule(app, rule, now).catch((err: unknown) => console.error(`[wizelens-cloud] alert ${rule.id} failed:`, err));
  }
}
