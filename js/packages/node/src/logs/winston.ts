import { addCleanup, logSinkOf } from "../adapters/registry.js";
import type { LogEntry, LogSink } from "../logger.js";
import type { WizeLens } from "../types.js";
import { markDirect } from "./captured.js";
import { errorAttributes, formatArgs, levelFromName } from "./levels.js";

type Info = Record<string | symbol, unknown>;
interface WinstonLike {
  write(info: Info): unknown;
  isLevelEnabled?(level: string): boolean;
}

const LEVEL = Symbol.for("level");
const SPLAT = Symbol.for("splat");
const SKIP = new Set(["level", "message", "stack"]);
const hooked = new WeakMap<object, Set<LogSink>>();

const TOKENS = /%[scdjifoO%]/g;

/** The message with `%s` tokens filled, and trailing objects that winston's splat format would merge in. */
function messageOf(info: Info): { message: string; extra: Record<string, unknown> } {
  const message = info.message;
  const splat = info[SPLAT];
  if (typeof message !== "string") return { message: formatArgs([message]), extra: {} };
  if (!Array.isArray(splat)) return { message, extra: {} };
  const used = (message.match(TOKENS) ?? []).filter((t) => t !== "%%").length;
  const extra = Object.assign({}, ...splat.slice(used).filter((v) => v && typeof v === "object" && !(v instanceof Error)));
  return { message: used > 0 ? formatArgs([message, ...splat.slice(0, used)]) : message, extra };
}

function toEntry(info: Info): LogEntry {
  const level = String(info[LEVEL] ?? info.level ?? "info");
  const attributes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(info)) if (!SKIP.has(k) && !(v instanceof Error)) attributes[k] = v;
  const err = Object.values(info).find((v) => v instanceof Error) ?? (info.message instanceof Error ? info.message : undefined);
  if (typeof info.stack === "string") attributes["exception.stacktrace"] = info.stack;
  const category = typeof info.label === "string" ? info.label : typeof info.service === "string" ? info.service : "winston";
  const { message, extra } = messageOf(info);
  return { level: levelFromName(level), category, message, attributes: { ...attributes, ...extra, ...errorAttributes(err) } };
}

/** Copy winston log lines into WizeLens: into the trace of the request they belong to, or (outside one) as loose lines. Child loggers made from it are covered too. */
export function instrumentWinston(wizelens: WizeLens, logger: unknown): boolean {
  const sink = logSinkOf(wizelens);
  const target = logger as WinstonLike | null;
  if (!sink || !target || typeof target.write !== "function") return false;
  markDirect("winston");
  const sinks = hooked.get(target) ?? new Set<LogSink>();
  sinks.add(sink);
  addCleanup(wizelens, () => sinks.delete(sink));
  if (hooked.has(target)) return true;
  hooked.set(target, sinks);
  const original = target.write;
  target.write = function (this: WinstonLike, info: Info) {
    const level = String(info?.[LEVEL] ?? info?.level ?? "");
    if (sinks.size > 0 && (this.isLevelEnabled?.(level) ?? true)) {
      try {
        const entry = toEntry(info);
        for (const s of sinks) s(entry);
      } catch {
        // A log line must never break the app.
      }
    }
    return original.call(this, info);
  };
  return true;
}
