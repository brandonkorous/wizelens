// Alert rules as every host keeps them, and the one step that decides what a new value does to a rule.
import type { MetricAlertStat } from "../metrics/alert.js";
import type { AlertMetric, AlertNoticeState, AlertOp } from "./alerts.js";

/** Where a notice goes. Email is cloud only (members of the organization). */
export type AlertChannel =
  | { kind: "webhook" | "slack" | "teams" | "discord"; url: string }
  | { kind: "pagerduty"; routingKey: string }
  | { kind: "email"; to: string[] };

export type AlertChannelKind = AlertChannel["kind"];

/** Channels a rule may hold, and the windows and reminders it may use. */
export const MAX_ALERT_CHANNELS = 5;
export const ALERT_WINDOWS_MS: readonly number[] = [5, 15, 60, 360, 1440].map((m) => m * 60_000);
export const ALERT_REMINDS_MS: readonly number[] = [0, 15, 60, 240, 1440].map((m) => m * 60_000);
/** "Muted until I unmute": far in the future, still a plain number. */
export const MUTED_FOREVER = 8_640_000_000_000_000;

/** What a person sets on a rule. */
export interface AlertRuleInput {
  name: string;
  /** A trace metric, "metric" for an OpenTelemetry metric (`metricName`, `metricStat`, `metricService`), or "slo" for an SLO's burn rate (`sloId`). */
  metric: AlertMetric | "metric" | "slo";
  /** For "slo" rules: the SLO whose error budget burn rate it watches. */
  sloId: string;
  metricName: string;
  metricStat: MetricAlertStat | "";
  metricService: string;
  op: AlertOp;
  threshold: number;
  windowMs: number;
  env: string;
  /** Trace rules only: one service (display name), and one endpoint of it. Empty for all. */
  service: string;
  endpoint: string;
  channels: AlertChannel[];
  enabled: boolean;
  /** Send again this often while it keeps firing and nobody acknowledged it; 0 for never. */
  remindMs: number;
}

/** A kept rule: what was set, and where it stands. */
export interface AlertRule extends AlertRuleInput {
  id: string;
  projectId: string;
  state: "ok" | "firing";
  lastValue: number | null;
  lastEvalMs: number | null;
  /** No notices until then (`MUTED_FOREVER` for "until I unmute"); null when not muted. */
  mutedUntilMs: number | null;
  /** When someone acknowledged the current firing; null when nobody did. Reminders stop until it resolves. */
  ackMs: number | null;
  /** When the rule last sent a fired, reminder, or resolved notice. */
  lastNotifiedMs: number | null;
}

/** What one evaluation changes: the new state and acknowledgement, and the notice to send (null for none). */
export interface AlertStep {
  state: "ok" | "firing";
  ackMs: number | null;
  notice: Exclude<AlertNoticeState, "test"> | null;
}

export const isMuted = (r: Pick<AlertRule, "mutedUntilMs">, now: number): boolean => r.mutedUntilMs !== null && r.mutedUntilMs > now;

/** Fired when it starts breaking, resolved when it stops, and a reminder while it keeps breaking unacknowledged. Muted rules change state quietly. */
export function alertStep(r: Pick<AlertRule, "state" | "ackMs" | "remindMs" | "lastNotifiedMs" | "mutedUntilMs">, breached: boolean, now: number): AlertStep {
  const quiet = isMuted(r, now);
  if (breached && r.state === "ok") return { state: "firing", ackMs: null, notice: quiet ? null : "fired" };
  if (!breached && r.state === "firing") return { state: "ok", ackMs: null, notice: quiet ? null : "resolved" };
  const due = breached && r.remindMs > 0 && r.ackMs === null && now - (r.lastNotifiedMs ?? 0) >= r.remindMs;
  return { state: r.state, ackMs: r.ackMs, notice: due && !quiet ? "remind" : null };
}
