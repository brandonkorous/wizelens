import { ALERT_METRICS, type AlertChannel, type AlertRule, logSearchText, METRIC_ALERT_STATS } from "@wizeworks/lens-core";
import { currentProject, useAccount } from "../../data/account";
import { useHost } from "../../data/host";
import { getScope } from "../../data/prefs";
import { cloudResource, type InProject } from "../../data/projectScope";

export type { AlertChannel as Channel, AlertRule } from "@wizeworks/lens-core";

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  kind: "fired" | "resolved" | "remind" | "test" | "ack" | "mute" | "unmute";
  value: number | null;
  threshold: number;
  message: string;
  timeMs: number;
  delivery: string;
  /** The problem a fired notice named (cloud), or null. */
  problem?: { id: string; title: string; url: string } | null;
}

export interface AlertsData {
  rules: InProject<AlertRule>[];
  events: InProject<AlertEvent>[];
}

/** One rule's page: the rule, its events, and its evaluated values. */
export interface AlertRuleData {
  rule: AlertRule;
  events: AlertEvent[];
  values: { timeMs: number; value: number | null }[];
}

export const WINDOWS: [string, string][] = [
  ["300000", "5 minutes"],
  ["900000", "15 minutes"],
  ["3600000", "1 hour"],
  ["21600000", "6 hours"],
  ["86400000", "24 hours"],
];

export const REMINDS: [string, string][] = [
  ["0", "No reminders"],
  ["900000", "Remind every 15 minutes"],
  ["3600000", "Remind every hour"],
  ["14400000", "Remind every 4 hours"],
  ["86400000", "Remind every day"],
];

export const windowLabel = (ms: number) => WINDOWS.find(([v]) => Number(v) === ms)?.[1] ?? `${Math.round(ms / 60_000)} min`;

export const OP_SIGN: Record<AlertRule["op"], string> = { ">": ">", "<": "<", ">=": "≥", "<=": "≤", above_normal: "above normal" };
const SENSITIVITY_NAME: Record<number, string> = { 2: "high", 3: "medium", 4: "low" };

const unitOf = (r: AlertRule) => (r.metric === "metric" ? "" : r.metric === "slo" ? "×" : ALERT_METRICS[r.metric].unit);
const plain = (v: number) => (Number.isInteger(v) ? String(v) : Math.abs(v) < 1 ? v.toPrecision(3) : v.toFixed(1));

export const fmtValue = (r: AlertRule, v: number | null) => (v === null ? "–" : `${plain(v)}${unitOf(r) === "%" || unitOf(r) === "×" ? unitOf(r) : unitOf(r) ? ` ${unitOf(r)}` : ""}`);

/** "Error rate", or "process.cpu.utilization average (api)"; with its scope. */
export function ruleLabel(r: AlertRule): string {
  if (r.metric === "metric") return `${r.metricName} ${METRIC_ALERT_STATS[r.metricStat || "avg"].toLowerCase()}${r.metricService ? ` (${r.metricService})` : ""}`;
  if (r.metric === "slo") return "SLO burn rate";
  if (r.metric === "log_count" && logSearchText(r.logSearch ?? {})) return `Log lines (${logSearchText(r.logSearch ?? {})})`;
  const scope = r.endpoint ? ` of ${r.endpoint} (${r.service})` : r.service ? ` of ${r.service}` : "";
  return `${ALERT_METRICS[r.metric].label}${scope}`;
}

/** "> 5%", or for "above normal" rules their sensitivity: "above normal (medium)". */
const lineText = (r: AlertRule) => (r.op === "above_normal" ? `above normal (${SENSITIVITY_NAME[r.threshold] ?? `${r.threshold} spreads`})` : `${OP_SIGN[r.op]} ${fmtValue(r, r.threshold)}`);

/** "Error rate > 5% over 5 minutes · Production". */
export const ruleText = (r: AlertRule) => `${ruleLabel(r)} ${lineText(r)} over ${windowLabel(r.windowMs)}${r.env ? ` · ${r.env}` : ""}`;

/** Where a host keeps alert rules: the cloud by project id (a rule's own under "All projects"), the hub by `?project=` (empty for all). */
export function useAlertsApi(): { url: (path?: string, projectId?: string) => string; ready: boolean; canWrite: boolean } {
  const host = useHost();
  const cloud = host.has("accounts");
  const role = currentProject(useAccount())?.org.role;
  const project = getScope().project;
  const url = (path = "", projectId?: string) => (cloud ? cloudResource("alerts", path, projectId) : `./api/alerts${path}?project=${encodeURIComponent(project)}`);
  return { url, ready: !cloud || !!project, canWrite: !cloud || (role !== undefined && role !== "viewer") };
}

export const channelLabel = (c: AlertChannel): string => ({ webhook: "Webhook", slack: "Slack", teams: "Teams", discord: "Discord", pagerduty: "PagerDuty", email: "Email" })[c.kind];
