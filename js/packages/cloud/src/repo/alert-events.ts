// What happened to alert rules: notices sent, people's mutes and acknowledgements, and every evaluated value.
import type { AlertRule } from "@wizeworks/lens-core";
import { newId } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";

export type AlertEventKind = "fired" | "resolved" | "remind" | "test" | "ack" | "mute" | "unmute";

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  kind: AlertEventKind;
  value: number | null;
  threshold: number;
  message: string;
  timeMs: number;
  delivery: string;
  /** The problem a fired notice named, or null. */
  problem: EventProblem | null;
}

/** A problem card a notice linked to. */
export interface EventProblem {
  id: string;
  title: string;
  url: string;
}

/** Evaluated values are kept this long, for the rule's chart. */
export const ALERT_VALUES_KEEP_MS = 30 * 86_400_000;

type NewEvent = Omit<AlertEvent, "id" | "ruleId" | "ruleName" | "threshold" | "problem"> & { problem?: EventProblem | null };

export async function addEvent(q: Queryable, rule: Pick<AlertRule, "id" | "projectId" | "threshold">, e: NewEvent): Promise<void> {
  await q.query(
    `INSERT INTO alert_events (id, rule_id, project_id, kind, value, threshold, message, time_ms, delivery, problem) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [newId(), rule.id, rule.projectId, e.kind, e.value, rule.threshold, e.message, e.timeMs, e.delivery, e.problem ? JSON.stringify(e.problem) : ""],
  );
}

function problemOf(text: string): EventProblem | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as EventProblem;
  } catch {
    return null;
  }
}

type EventRow = Omit<AlertEvent, "problem"> & { problem: string };
const EVENT_COLUMNS = `e.id, e.rule_id AS "ruleId", r.name AS "ruleName", e.kind, e.value, e.threshold, e.message, e.time_ms AS "timeMs", e.delivery, e.problem`;
const toEvent = (e: EventRow): AlertEvent => ({ ...e, value: e.value === null ? null : Number(e.value), threshold: Number(e.threshold), timeMs: Number(e.timeMs), problem: problemOf(e.problem) });

export const listEvents = async (q: Queryable, projectId: string, limit: number): Promise<AlertEvent[]> =>
  (await q.query<EventRow>(`SELECT ${EVENT_COLUMNS} FROM alert_events e JOIN alert_rules r ON r.id = e.rule_id WHERE e.project_id = $1 ORDER BY e.time_ms DESC LIMIT $2`, [projectId, limit])).map(toEvent);

export const ruleEvents = async (q: Queryable, ruleId: string, limit: number): Promise<AlertEvent[]> =>
  (await q.query<EventRow>(`SELECT ${EVENT_COLUMNS} FROM alert_events e JOIN alert_rules r ON r.id = e.rule_id WHERE e.rule_id = $1 ORDER BY e.time_ms DESC LIMIT $2`, [ruleId, limit])).map(toEvent);

/** One rule's evaluated values in [from, to), oldest first. */
export async function ruleValues(q: Queryable, ruleId: string, from: number, to: number): Promise<{ timeMs: number; value: number | null }[]> {
  const rows = await q.query<{ timeMs: number; value: number | null }>(`SELECT time_ms AS "timeMs", value FROM alert_values WHERE rule_id = $1 AND time_ms >= $2 AND time_ms < $3 ORDER BY time_ms`, [ruleId, from, to]);
  return rows.map((r) => ({ timeMs: Number(r.timeMs), value: r.value === null ? null : Number(r.value) }));
}

export async function pruneAlertValues(q: Queryable, now: number): Promise<void> {
  await q.query("DELETE FROM alert_values WHERE time_ms < $1", [now - ALERT_VALUES_KEEP_MS]);
}
