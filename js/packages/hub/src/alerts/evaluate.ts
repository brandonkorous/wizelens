// The hub's alert loop: every minute, each enabled rule reads its window from the hub file and sends notices when its state changes.
import type { SQLInputValue } from "node:sqlite";
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
  metricAlertSteps,
  metricAlertUnit,
  metricAlertValueOf,
  type MetricRows,
  opHolds,
  runMetricSync,
} from "@wizeworks/lens-core";
import { hubExecutor } from "../scale-exec.js";
import type { HubStore } from "../store.js";
import { deliver, type Notice, type Outbox } from "./deliver.js";
import { addEvent, addValue, enabledRules, saveRule } from "./store.js";

export interface HubAlertDeps {
  store: HubStore;
  outbox: Outbox;
  /** The hub's address, for the link in each notice. */
  baseUrl: () => string;
}

/** The OpenTelemetry metric of a rule over its window, from the metric rollups, and its unit. */
function measureMetric(store: HubStore, rule: AlertRule, now: number): { value: number | null; unit: string } {
  const at = alignNow(now);
  const scope = { project: rule.projectId || undefined, env: rule.env || undefined, service: rule.metricService || undefined };
  const steps = metricAlertSteps("sqlite", scope, rule.metricName, { from: at - rule.windowMs, to: at }, at);
  const data = runMetricSync(steps, (q) => store.db.prepare(q.sql).all(...(q.args as SQLInputValue[])) as MetricRows);
  const stat = rule.metricStat || "avg";
  return { value: metricAlertValueOf(data, stat), unit: data.series[0] ? metricAlertUnit(data.series[0], stat) : "" };
}

async function measure(store: HubStore, rule: AlertRule, now: number): Promise<number | null> {
  if (rule.metric === "metric") return measureMetric(store, rule, now).value;
  const page = alertPage(rule.metric, { service: rule.service, endpoint: rule.endpoint });
  return computePage(page, alertContext(rule.windowMs, alignNow(now)), hubExecutor(store, { project: rule.projectId || undefined, env: rule.env || undefined }));
}

function messageOf(store: HubStore, rule: AlertRule, state: AlertNoticeState, value: number | null, now: number): string {
  if (rule.metric !== "metric") return alertMessage(rule.metric, rule.op, value, rule.threshold, state);
  return metricAlertMessage(rule.metricName, rule.metricStat || "avg", rule.op, value, rule.threshold, measureMetric(store, rule, now).unit, state);
}

/** Send a notice through the rule's channels and keep it as an event. */
export async function notifyHub(deps: HubAlertDeps, rule: AlertRule, state: AlertNoticeState, value: number | null, now: number): Promise<string> {
  const project = rule.projectId ? `?project=${encodeURIComponent(rule.projectId)}` : "";
  const notice: Notice = {
    ruleId: rule.id,
    rule: rule.name,
    project: rule.projectId || "hub",
    state,
    message: messageOf(deps.store, rule, state, value, now),
    value,
    threshold: rule.threshold,
    timeMs: now,
    url: `${deps.baseUrl()}/_wizelens/#/alerts/${rule.id}${project}`,
  };
  const delivery = await deliver(rule.channels, notice, deps.outbox);
  addEvent(deps.store.db, rule, { kind: state, value, message: notice.message, timeMs: now, delivery });
  return delivery;
}

const breaches = (rule: AlertRule, value: number | null): boolean =>
  rule.metric === "metric" ? value !== null && opHolds(rule.op, value, rule.threshold) : alertBreached(rule.metric, rule.op, value, rule.threshold);

/** Check one rule: keep its value, and notify when it starts or stops firing, or remind while it keeps firing. */
export async function evaluateHubRule(deps: HubAlertDeps, rule: AlertRule, now: number): Promise<void> {
  const value = await measure(deps.store, rule, now);
  const step = alertStep(rule, breaches(rule, value), now);
  const next = { ...rule, state: step.state, ackMs: step.ackMs, lastValue: value, lastEvalMs: now, lastNotifiedMs: step.notice ? now : rule.lastNotifiedMs };
  saveRule(deps.store.db, next, now);
  addValue(deps.store.db, rule.id, now, value);
  if (step.notice) await notifyHub(deps, next, step.notice, value, now);
}

/** Check every enabled rule once. One failing rule does not stop the others. */
export async function evaluateHubAlerts(deps: HubAlertDeps, now: number): Promise<void> {
  for (const rule of enabledRules(deps.store.db)) {
    await evaluateHubRule(deps, rule, now).catch((err: unknown) => console.error(`[wizelens-hub] alert ${rule.id} failed:`, err));
  }
}
