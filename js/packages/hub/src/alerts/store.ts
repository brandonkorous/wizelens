// Alert rules on the hub: one JSON row per rule, its events, and every evaluated value (for the rule's chart).
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AlertRule, AlertRuleInput } from "@wizeworks/lens-core";

export interface HubAlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  kind: "fired" | "resolved" | "remind" | "test" | "ack" | "mute" | "unmute";
  value: number | null;
  threshold: number;
  message: string;
  timeMs: number;
  delivery: string;
}

/** Evaluated values are kept this long. */
export const HUB_ALERT_VALUES_KEEP_MS = 30 * 86_400_000;

const rulesOf = (rows: unknown[]): AlertRule[] => (rows as { json: string }[]).map((r) => JSON.parse(r.json) as AlertRule);

export const listRules = (db: DatabaseSync, project: string): AlertRule[] => rulesOf(db.prepare("SELECT json FROM alert_rules WHERE project = ? ORDER BY created_ms").all(project));

export const enabledRules = (db: DatabaseSync): AlertRule[] => rulesOf(db.prepare("SELECT json FROM alert_rules").all()).filter((r) => r.enabled);

export const ruleById = (db: DatabaseSync, project: string, id: string): AlertRule | undefined => rulesOf(db.prepare("SELECT json FROM alert_rules WHERE project = ? AND id = ?").all(project, id))[0];

export function saveRule(db: DatabaseSync, r: AlertRule, now: number): void {
  db.prepare("INSERT INTO alert_rules (id, project, json, created_ms) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json").run(r.id, r.projectId, JSON.stringify(r), now);
}

/** A new rule from checked input, not firing. */
export function createRule(db: DatabaseSync, project: string, input: AlertRuleInput, now: number): AlertRule {
  const rule: AlertRule = { ...input, id: randomUUID(), projectId: project, state: "ok", lastValue: null, lastEvalMs: null, mutedUntilMs: null, ackMs: null, lastNotifiedMs: null };
  saveRule(db, rule, now);
  return rule;
}

export function deleteRule(db: DatabaseSync, project: string, id: string): boolean {
  db.prepare("DELETE FROM alert_events WHERE rule_id = ?").run(id);
  db.prepare("DELETE FROM alert_values WHERE rule_id = ?").run(id);
  return Number(db.prepare("DELETE FROM alert_rules WHERE project = ? AND id = ?").run(project, id).changes) > 0;
}

export function addEvent(db: DatabaseSync, r: AlertRule, e: Pick<HubAlertEvent, "kind" | "value" | "message" | "timeMs" | "delivery">): void {
  db.prepare("INSERT INTO alert_events (id, rule_id, project, kind, value, threshold, message, time_ms, delivery) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    randomUUID(),
    r.id,
    r.projectId,
    e.kind,
    e.value,
    r.threshold,
    e.message,
    e.timeMs,
    e.delivery,
  );
}

const EVENT_SQL = `SELECT e.id, e.rule_id AS ruleId, r.json AS rule, e.kind, e.value, e.threshold, e.message, e.time_ms AS timeMs, e.delivery
  FROM alert_events e JOIN alert_rules r ON r.id = e.rule_id`;
const eventsOf = (rows: unknown[]): HubAlertEvent[] =>
  (rows as (Omit<HubAlertEvent, "ruleName"> & { rule: string })[]).map(({ rule, ...e }) => ({ ...e, ruleName: (JSON.parse(rule) as AlertRule).name }));

/** A project's events, newest first, `offset` rows in. */
export const listEvents = (db: DatabaseSync, project: string, limit: number, offset = 0): HubAlertEvent[] => eventsOf(db.prepare(`${EVENT_SQL} WHERE e.project = ? ORDER BY e.time_ms DESC, e.id LIMIT ? OFFSET ?`).all(project, limit, offset));

/** One rule's events, newest first, `offset` rows in. */
export const ruleEvents = (db: DatabaseSync, id: string, limit: number, offset = 0): HubAlertEvent[] => eventsOf(db.prepare(`${EVENT_SQL} WHERE e.rule_id = ? ORDER BY e.time_ms DESC, e.id LIMIT ? OFFSET ?`).all(id, limit, offset));

/** How many events a project, or one rule, has. */
export const countEvents = (db: DatabaseSync, by: { project: string } | { rule: string }): number =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM alert_events WHERE ${"project" in by ? "project" : "rule_id"} = ?`).get("project" in by ? by.project : by.rule) as { n: number }).n);

export function addValue(db: DatabaseSync, id: string, timeMs: number, value: number | null): void {
  db.prepare("INSERT INTO alert_values (rule_id, time_ms, value) VALUES (?, ?, ?) ON CONFLICT (rule_id, time_ms) DO UPDATE SET value = excluded.value").run(id, timeMs, value);
}

export const ruleValues = (db: DatabaseSync, id: string, from: number, to: number): { timeMs: number; value: number | null }[] =>
  db.prepare("SELECT time_ms AS timeMs, value FROM alert_values WHERE rule_id = ? AND time_ms >= ? AND time_ms < ? ORDER BY time_ms").all(id, from, to) as { timeMs: number; value: number | null }[];

export function pruneAlertValues(db: DatabaseSync, now: number): void {
  db.prepare("DELETE FROM alert_values WHERE time_ms < ?").run(now - HUB_ALERT_VALUES_KEEP_MS);
}
