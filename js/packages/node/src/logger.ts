import { type LogLevel, redactAttributes, toAttributeValue } from "@wizeworks/lens-core";
import { activeSpan } from "./spans.js";
import type { TraceStore } from "./store.js";
import type { LogFn, WizeLensLogger } from "./types.js";

export type LogWriter = (level: LogLevel, category: string, message: string, attributes?: Record<string, unknown>) => void;

const now = () => performance.timeOrigin + performance.now();

function toAttributes(attrs: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!attrs) return out;
  for (const [k, v] of Object.entries(attrs)) {
    const value = toAttributeValue(v);
    if (value !== null) out[k] = value;
  }
  return out;
}

function writeConsole(level: LogLevel, category: string, message: string): void {
  const fn = level === "error" || level === "critical" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[${level}] ${category}: ${message}`);
}

/** Writes a log record into the trace of the active span (and to the console when asked). */
export function createLogWriter(store: TraceStore, service: string, redactKeys: readonly string[], toConsole: boolean): LogWriter {
  return (level, category, message, attributes) => {
    if (toConsole) writeConsole(level, category, message);
    const span = activeSpan();
    if (!span) return;
    const sc = span.spanContext();
    store.addLog(sc.traceId, {
      timeMs: now(),
      level,
      category,
      message,
      service,
      spanId: sc.spanId,
      attributes: redactAttributes(toAttributes(attributes), redactKeys),
    });
  };
}

export function makeLogger(write: LogWriter, category: string): WizeLensLogger {
  const at =
    (level: LogLevel): LogFn =>
    (message, attributes) =>
      write(level, category, message, attributes);
  return {
    trace: at("trace"),
    debug: at("debug"),
    info: at("info"),
    warn: at("warn"),
    error: at("error"),
    critical: at("critical"),
    child: (c) => makeLogger(write, c),
  };
}

export function noopLogger(): WizeLensLogger {
  const noop: LogFn = () => {};
  const logger: WizeLensLogger = { trace: noop, debug: noop, info: noop, warn: noop, error: noop, critical: noop, child: () => logger };
  return logger;
}
