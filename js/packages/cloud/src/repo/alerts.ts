import type { AlertMetric, AlertOp } from "@wizeworks/lens-core";
import { newId } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";

export interface Channel {
  kind: "webhook" | "slack";
  url: string;
}

export interface AlertRule {
  id: string;
  projectId: string;
  name: string;
  metric: AlertMetric;
  op: AlertOp;
  threshold: number;
  windowMs: number;
  env: string;
  channels: Channel[];
  enabled: boolean;
  state: "ok" | "firing";
  lastValue: number | null;
  lastEvalMs: number | null;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  kind: "fired" | "resolved" | "test";
  value: number | null;
  threshold: number;
  message: string;
  timeMs: number;
  delivery: string;
}

export type RuleInput = Omit<AlertRule, "id" | "projectId" | "state" | "lastValue" | "lastEvalMs">;

const RULE_COLUMNS = `id, project_id AS "projectId", name, metric, op, threshold, window_ms AS "windowMs", env, channels, enabled, state,
  last_value AS "lastValue", last_eval_ms AS "lastEvalMs"`;

type RuleRow = Omit<AlertRule, "channels"> & { channels: string };
const toRule = (r: RuleRow): AlertRule => ({ ...r, channels: JSON.parse(r.channels) as Channel[] });

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

export async function createRule(q: Queryable, projectId: string, r: RuleInput, by: string, now: number): Promise<string> {
  const id = newId();
  await q.query(
    `INSERT INTO alert_rules (id, project_id, name, metric, op, threshold, window_ms, env, channels, enabled, created_by, created_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, projectId, r.name, r.metric, r.op, r.threshold, r.windowMs, r.env, JSON.stringify(r.channels), r.enabled, by, now],
  );
  return id;
}

export async function updateRule(q: Queryable, projectId: string, id: string, r: RuleInput): Promise<void> {
  await q.query(
    `UPDATE alert_rules SET name = $3, metric = $4, op = $5, threshold = $6, window_ms = $7, env = $8, channels = $9, enabled = $10,
       state = CASE WHEN $10 THEN state ELSE 'ok' END WHERE project_id = $1 AND id = $2`,
    [projectId, id, r.name, r.metric, r.op, r.threshold, r.windowMs, r.env, JSON.stringify(r.channels), r.enabled],
  );
}

export async function deleteRule(q: Queryable, projectId: string, id: string): Promise<boolean> {
  return (await q.query("DELETE FROM alert_rules WHERE project_id = $1 AND id = $2 RETURNING id", [projectId, id])).length > 0;
}

export async function saveEvaluation(q: Queryable, id: string, state: AlertRule["state"], value: number | null, now: number): Promise<void> {
  await q.query("UPDATE alert_rules SET state = $2, last_value = $3, last_eval_ms = $4 WHERE id = $1", [id, state, value, now]);
}

export async function addEvent(q: Queryable, rule: AlertRule, e: Omit<AlertEvent, "id" | "ruleId" | "ruleName" | "threshold">): Promise<void> {
  await q.query(
    `INSERT INTO alert_events (id, rule_id, project_id, kind, value, threshold, message, time_ms, delivery) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [newId(), rule.id, rule.projectId, e.kind, e.value, rule.threshold, e.message, e.timeMs, e.delivery],
  );
}

export const listEvents = (q: Queryable, projectId: string, limit: number): Promise<AlertEvent[]> =>
  q.query<AlertEvent>(
    `SELECT e.id, e.rule_id AS "ruleId", r.name AS "ruleName", e.kind, e.value, e.threshold, e.message, e.time_ms AS "timeMs", e.delivery
     FROM alert_events e JOIN alert_rules r ON r.id = e.rule_id WHERE e.project_id = $1 ORDER BY e.time_ms DESC LIMIT $2`,
    [projectId, limit],
  );
