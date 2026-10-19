import type { AlertMetric, AlertOp, MetricAlertStat } from "@wizeworks/lens-core";

/** Where a notice goes: a webhook or Slack URL, or email to members of the organization. */
export type Channel = { kind: "webhook" | "slack"; url: string } | { kind: "email"; to: string[] };

export interface AlertRule {
  id: string;
  name: string;
  /** A trace metric, or "metric" for one OpenTelemetry metric. */
  metric: AlertMetric | "metric";
  /** For "metric" rules: the metric, what to read, and optionally one service. Empty on trace rules. */
  metricName: string;
  metricStat: MetricAlertStat | "";
  metricService: string;
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
  /** The problem a fired notice linked to, or null. */
  problem: { id: string; title: string; url: string } | null;
}

export interface AlertsData {
  rules: AlertRule[];
  events: AlertEvent[];
}

export const WINDOWS: [string, string][] = [
  ["300000", "5 minutes"],
  ["900000", "15 minutes"],
  ["3600000", "1 hour"],
  ["21600000", "6 hours"],
  ["86400000", "24 hours"],
];

export const windowLabel = (ms: number) => WINDOWS.find(([v]) => Number(v) === ms)?.[1] ?? `${Math.round(ms / 60_000)} min`;
