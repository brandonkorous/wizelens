import { DEFAULT_LOOSE_LOGS, keepLooseLine, type LogLevel, type LooseLogOptions, redactAttributes, redactText, toAttributeValue } from "@wizeworks/lens-core";
import { activeSpan } from "./spans.js";
import type { TraceStore } from "./store.js";
import type { LogFn, WizeLensLogger } from "./types.js";

export type LogWriter = (level: LogLevel, category: string, message: string, attributes?: Record<string, unknown>) => void;

/** One log line from any logger. Without `span`, it goes to the span that is active now. */
export interface LogEntry {
  level: LogLevel;
  category: string;
  message: string;
  attributes?: Record<string, unknown>;
  timeMs?: number;
  span?: { traceId: string; spanId: string };
}

/** Puts a log line into the trace it belongs to, or (outside a request) into the current loose batch. */
export type LogSink = (entry: LogEntry) => void;

const MAX_MESSAGE = 8000;
const MAX_VALUE = 4000;
const now = () => performance.timeOrigin + performance.now();
let quietDepth = 0;

/** Run `fn` while console capture ignores what it writes (WizeLens's own console output). */
export function quietly(fn: () => void): void {
  quietDepth++;
  try {
    fn();
  } finally {
    quietDepth--;
  }
}

/** True while WizeLens writes to the console itself. */
export const isQuiet = () => quietDepth > 0;

const cap = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

function toAttributes(attrs: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!attrs) return out;
  for (const [k, v] of Object.entries(attrs)) {
    const value = toAttributeValue(v);
    if (value !== null) out[k] = typeof value === "string" ? cap(value, MAX_VALUE) : value;
  }
  return out;
}

/** The sink every logger adapter writes to: lines in a request go to its trace, lines outside one to a loose batch. It never throws. */
export function createLogSink(store: TraceStore, service: string, redactKeys: readonly string[], loose: LooseLogOptions = DEFAULT_LOOSE_LOGS): LogSink {
  return (e) => {
    try {
      const sc = e.span ?? activeSpan()?.spanContext();
      if (!sc && (!keepLooseLine(loose, e.level) || /^wizelens/i.test(e.category))) return;
      const log = {
        timeMs: e.timeMs ?? now(),
        level: e.level,
        category: e.category,
        message: cap(redactText(e.message), MAX_MESSAGE),
        service,
        spanId: sc?.spanId ?? null,
        attributes: redactAttributes(toAttributes(e.attributes), redactKeys),
      };
      if (sc) store.addLog(sc.traceId, log);
      else store.addLooseLog(log);
    } catch {
      // A log line must never break the app.
    }
  };
}

function writeConsole(level: LogLevel, category: string, message: string): void {
  const fn = level === "error" || level === "critical" ? console.error : level === "warn" ? console.warn : console.log;
  quietly(() => fn(`[${level}] ${category}: ${message}`));
}

/** The writer behind `wizelens.logger`: the sink, and the console when asked. */
export function createLogWriter(sink: LogSink, toConsole: boolean): LogWriter {
  return (level, category, message, attributes) => {
    if (toConsole) writeConsole(level, category, message);
    sink({ level, category, message, attributes });
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
