import { alertBreached, alertMessage, alertValue } from "@wizeworks/lens-core";
import type { CloudApp } from "../app.js";
import { addEvent, type AlertRule, enabledRules, saveEvaluation } from "../repo/alerts.js";
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
    message: alertMessage(rule.metric, rule.op, value, rule.threshold),
    value,
    threshold: rule.threshold,
    timeMs: now,
    url: `${base}/_wizelens/#/alerts?project=${rule.projectId}`,
  };
}

/** The metric over the rule's window, from the traces that started in it. */
async function measure(app: CloudApp, rule: AlertRule, now: number): Promise<number | null> {
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
  const firing = alertBreached(rule.metric, rule.op, value, rule.threshold);
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
