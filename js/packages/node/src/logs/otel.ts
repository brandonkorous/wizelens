import type { Context } from "@opentelemetry/api";
import { trace } from "@opentelemetry/api";
import { logSinkOf } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { isBridged } from "./captured.js";
import { levelFromName, levelFromSeverity } from "./levels.js";

interface OtelLogRecord {
  hrTime?: [number, number];
  spanContext?: { traceId: string; spanId: string };
  severityNumber?: number;
  severityText?: string;
  body?: unknown;
  attributes?: Record<string, unknown>;
  instrumentationScope?: { name?: string };
}

const timeOf = (hr: [number, number] | undefined) => (hr ? hr[0] * 1000 + hr[1] / 1e6 : undefined);

/** An OpenTelemetry log processor: `new LoggerProvider({ processors: [wizelensLogProcessor(wizelens)] })`. */
export function wizelensLogProcessor(wizelens: WizeLens) {
  return {
    onEmit(record: OtelLogRecord, ctx?: Context): void {
      const sink = logSinkOf(wizelens);
      const scope = record.instrumentationScope?.name;
      if (!sink || isBridged(scope)) return;
      const span = record.spanContext ?? (ctx ? trace.getSpanContext(ctx) : undefined);
      if (!span) return;
      const body = record.body;
      sink({
        level: record.severityNumber ? levelFromSeverity(record.severityNumber) : levelFromName(record.severityText),
        category: scope || "otel",
        message: typeof body === "string" ? body : JSON.stringify(body ?? ""),
        attributes: record.attributes,
        timeMs: timeOf(record.hrTime),
        span: { traceId: span.traceId, spanId: span.spanId },
      });
    },
    forceFlush: async (): Promise<void> => {},
    shutdown: async (): Promise<void> => {},
  };
}
