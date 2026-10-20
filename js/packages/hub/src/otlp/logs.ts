import { type HubLog, type LogLevel, looseTraceIdOf, redactAttributes, redactText } from "@wizeworks/lens-core";
import type { HubWrite } from "../store.js";
import { attributesOf, hexId, nanosToMs, type OtlpAnyValue, type OtlpKeyValue, type OtlpResource, senderOf, valueOf } from "./values.js";

export interface OtlpLogRecord {
  timeUnixNano?: string | number;
  observedTimeUnixNano?: string | number;
  severityNumber?: number | string;
  severityText?: string;
  body?: OtlpAnyValue;
  attributes?: OtlpKeyValue[];
  traceId?: string;
  spanId?: string;
}

export interface OtlpResourceLogs {
  resource?: OtlpResource;
  scopeLogs?: { scope?: { name?: string }; logRecords?: OtlpLogRecord[] }[];
}

const LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "critical"];

/** Severity 1-4 is trace, 5-8 debug, ... 21-24 critical. Text wins when the number is missing. */
function levelOf(r: OtlpLogRecord): LogLevel {
  const n = Number(r.severityNumber);
  if (n >= 1 && n <= 24) return LEVELS[Math.floor((n - 1) / 4)]!;
  const t = r.severityText?.toLowerCase() ?? "";
  if (t.startsWith("warn")) return "warn";
  if (t.startsWith("fatal") || t.startsWith("crit")) return "critical";
  return LEVELS.find((l) => t.startsWith(l)) ?? "info";
}

/** Log records: those of a trace go into it; those without one (startup, jobs) into a loose trace per source and 5-minute window. */
export function writesFromLogs(list: readonly OtlpResourceLogs[], redactKeys: readonly string[]): HubWrite[] {
  return list.map((rl) => {
    const sender = senderOf(rl.resource);
    const source = [sender.project, sender.service, sender.environment, sender.host].join("|");
    const logs: HubLog[] = [];
    for (const sl of rl.scopeLogs ?? []) {
      for (const r of sl.logRecords ?? []) {
        const timeMs = nanosToMs(r.timeUnixNano) || nanosToMs(r.observedTimeUnixNano);
        const traced = hexId(r.traceId, 32);
        const traceId = traced || looseTraceIdOf(source, timeMs);
        const body = valueOf(r.body);
        logs.push({
          traceId,
          log: {
            timeMs,
            level: levelOf(r),
            category: sl.scope?.name || "otlp",
            message: body === null ? "" : redactText(String(body).slice(0, 10_000)),
            service: sender.service,
            spanId: traced ? (hexId(r.spanId, 16) ?? null) : null,
            attributes: redactAttributes(attributesOf(r.attributes), redactKeys),
          },
        });
      }
    }
    return { sender, via: "otlp" as const, spans: [], logs, remotes: [] };
  });
}
