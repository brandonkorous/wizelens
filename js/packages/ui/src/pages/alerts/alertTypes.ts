import type { AlertMetric, AlertOp } from "@wizeworks/lens-core";

export interface Channel {
  kind: "webhook" | "slack";
  url: string;
}

export interface AlertRule {
  id: string;
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
