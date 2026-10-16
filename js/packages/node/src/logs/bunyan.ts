import { addCleanup, logSinkOf } from "../adapters/registry.js";
import type { LogEntry, LogSink } from "../logger.js";
import { activeSpan } from "../spans.js";
import type { WizeLens } from "../types.js";
import { markDirect } from "./captured.js";
import { levelFromNumber } from "./levels.js";

type Rec = Record<string, unknown>;
interface BunyanLike {
  addStream(stream: { type: "raw"; level?: number | string; stream: { write(rec: Rec): void } }): void;
  level(): number;
}

const CORE = new Set(["name", "hostname", "pid", "level", "msg", "time", "v", "err", "src"]);

function toEntry(rec: Rec): LogEntry {
  const attributes: Rec = {};
  for (const [k, v] of Object.entries(rec)) if (!CORE.has(k)) attributes[k] = v;
  const err = rec.err as { name?: string; message?: string; stack?: string } | undefined;
  if (err && typeof err === "object") {
    Object.assign(attributes, { "exception.type": err.name, "exception.message": err.message, "exception.stacktrace": err.stack });
  }
  const timeMs = rec.time instanceof Date ? rec.time.getTime() : undefined;
  return { level: levelFromNumber(Number(rec.level) || 30), category: String(rec.name ?? "bunyan"), message: String(rec.msg ?? ""), attributes, timeMs };
}

/** Copy bunyan log lines written during a request into its trace. Call it before you make child loggers. */
export function instrumentBunyan(wizelens: WizeLens, logger: unknown): boolean {
  const sink = logSinkOf(wizelens);
  const target = logger as BunyanLike | null;
  if (!sink || !target || typeof target.addStream !== "function") return false;
  markDirect("bunyan");
  const sinks = new Set<LogSink>([sink]);
  addCleanup(wizelens, () => sinks.delete(sink));
  const write = (rec: Rec) => {
    if (sinks.size === 0 || !activeSpan()) return;
    try {
      const entry = toEntry(rec);
      for (const s of sinks) s(entry);
    } catch {
      // A log line must never break the app.
    }
  };
  target.addStream({ type: "raw", level: target.level(), stream: { write } });
  return true;
}
