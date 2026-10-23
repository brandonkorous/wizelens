import type { AlertRule, AlertRuleInput } from "@wizeworks/lens-core";
import { newId } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";

export type { AlertChannel as Channel, AlertRule } from "@wizeworks/lens-core";
export type RuleInput = AlertRuleInput;

const RULE_COLUMNS = `id, project_id AS "projectId", name, metric, metric_name AS "metricName", metric_stat AS "metricStat",
  metric_service AS "metricService", slo_id AS "sloId", log_search AS "logSearch", op, threshold, window_ms AS "windowMs", env, service, endpoint, channels, enabled,
  remind_ms AS "remindMs", state, last_value AS "lastValue", last_eval_ms AS "lastEvalMs", muted_until_ms AS "mutedUntilMs",
  ack_ms AS "ackMs", last_notified_ms AS "lastNotifiedMs"`;

type RuleRow = Omit<AlertRule, "channels" | "logSearch"> & { channels: string; logSearch: string };
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const toRule = (r: RuleRow): AlertRule => ({
  ...r,
  threshold: Number(r.threshold),
  windowMs: Number(r.windowMs),
  remindMs: Number(r.remindMs),
  lastValue: num(r.lastValue),
  lastEvalMs: num(r.lastEvalMs),
  mutedUntilMs: num(r.mutedUntilMs),
  ackMs: num(r.ackMs),
  lastNotifiedMs: num(r.lastNotifiedMs),
  channels: JSON.parse(r.channels) as AlertRule["channels"],
  logSearch: JSON.parse(r.logSearch || "{}") as Record<string, string>,
});

export async function listRules(q: Queryable, projectId: string): Promise<AlertRule[]> {
  return (await q.query<RuleRow>(`SELECT ${RULE_COLUMNS} FROM alert_rules WHERE project_id = $1 ORDER BY name`, [projectId])).map(toRule);
}

export async function enabledRules(q: Queryable): Promise<AlertRule[]> {
  return (await q.query<RuleRow>(`SELECT ${RULE_COLUMNS} FROM alert_rules WHERE enabled`)).map(toRule);
}

export async function ruleById(q: Queryable, projectId: string, id: string): Promise<AlertRule | undefined> {
  const [row] = await q.query<RuleRow>(`SELECT ${RULE_COLUMNS} FROM alert_rules WHERE project_id = $1 AND id = $2`, [projectId, id]);
  return row && toRule(row);
}

const inputValues = (r: RuleInput) => [r.name, r.metric, r.op, r.threshold, r.windowMs, r.env, JSON.stringify(r.channels), r.enabled, r.metricName, r.metricStat, r.metricService, r.service, r.endpoint, r.remindMs, r.sloId, JSON.stringify(r.logSearch ?? {})];

export async function createRule(q: Queryable, projectId: string, r: RuleInput, by: string, now: number): Promise<string> {
  const id = newId();
  await q.query(
    `INSERT INTO alert_rules (id, project_id, name, metric, op, threshold, window_ms, env, channels, enabled, metric_name, metric_stat,
       metric_service, service, endpoint, remind_ms, slo_id, log_search, created_by, created_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [id, projectId, ...inputValues(r), by, now],
  );
  return id;
}

/** Turning a rule off also clears its firing state and acknowledgement. */
export async function updateRule(q: Queryable, projectId: string, id: string, r: RuleInput): Promise<void> {
  await q.query(
    `UPDATE alert_rules SET name = $3, metric = $4, op = $5, threshold = $6, window_ms = $7, env = $8, channels = $9, enabled = $10,
       metric_name = $11, metric_stat = $12, metric_service = $13, service = $14, endpoint = $15, remind_ms = $16, slo_id = $17, log_search = $18,
       state = CASE WHEN $10 THEN state ELSE 'ok' END, ack_ms = CASE WHEN $10 THEN ack_ms ELSE NULL END WHERE project_id = $1 AND id = $2`,
    [projectId, id, ...inputValues(r)],
  );
}

/** Turn a rule on or off; off also clears its firing state and acknowledgement. */
export async function setRuleEnabled(q: Queryable, projectId: string, id: string, on: boolean): Promise<void> {
  await q.query(
    "UPDATE alert_rules SET enabled = $3, state = CASE WHEN $3 THEN state ELSE 'ok' END, ack_ms = CASE WHEN $3 THEN ack_ms ELSE NULL END WHERE project_id = $1 AND id = $2",
    [projectId, id, on],
  );
}

export async function deleteRule(q: Queryable, projectId: string, id: string): Promise<boolean> {
  return (await q.query("DELETE FROM alert_rules WHERE project_id = $1 AND id = $2 RETURNING id", [projectId, id])).length > 0;
}

/** Mute until a time (null unmutes). */
export async function muteRule(q: Queryable, projectId: string, id: string, untilMs: number | null): Promise<void> {
  await q.query("UPDATE alert_rules SET muted_until_ms = $3 WHERE project_id = $1 AND id = $2", [projectId, id, untilMs]);
}

/** Acknowledge the current firing: reminders stop until it resolves. */
export async function ackRule(q: Queryable, projectId: string, id: string, now: number): Promise<void> {
  await q.query("UPDATE alert_rules SET ack_ms = $3 WHERE project_id = $1 AND id = $2 AND state = 'firing'", [projectId, id, now]);
}

/** Keep an evaluation: the state, its acknowledgement, the value (also in the rule's history), and when it last sent a notice. */
export async function saveEvaluation(q: Queryable, r: AlertRule, step: { state: AlertRule["state"]; ackMs: number | null; notified: boolean }, value: number | null, now: number): Promise<void> {
  await q.query(
    "UPDATE alert_rules SET state = $2, ack_ms = $3, last_value = $4, last_eval_ms = $5, last_notified_ms = CASE WHEN $6 THEN $5 ELSE last_notified_ms END WHERE id = $1",
    [r.id, step.state, step.ackMs, value, now, step.notified],
  );
  await q.query("INSERT INTO alert_values (rule_id, time_ms, value) VALUES ($1, $2, $3) ON CONFLICT (rule_id, time_ms) DO UPDATE SET value = $3", [r.id, now, value]);
}
