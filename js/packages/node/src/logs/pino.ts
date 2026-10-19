import { addCleanup, logSinkOf } from "../adapters/registry.js";
import type { LogEntry, LogSink } from "../logger.js";
import type { WizeLens } from "../types.js";
import { markDirect } from "./captured.js";
import { errorAttributes, levelFromNumber } from "./levels.js";

type Bag = Record<string | symbol, unknown>;
type Write = (this: Bag, obj: unknown, msg: unknown, num: number) => unknown;
interface Keys {
  message: symbol | undefined;
  error: symbol | undefined;
}

const SERIALIZERS = Symbol.for("pino.serializers");
// Fastify's own lines for every request. The trace already shows them.
const FASTIFY_LINES = new Set(["incoming request", "request completed"]);
const patched = new WeakMap<object, Set<LogSink>>();

/** Every symbol on the logger and its prototypes, by description. */
function symbolsOf(logger: object): Map<string, { owner: object; key: symbol }> {
  const out = new Map<string, { owner: object; key: symbol }>();
  for (let o: object | null = logger; o; o = Object.getPrototypeOf(o)) {
    for (const key of Object.getOwnPropertySymbols(o)) if (key.description && !out.has(key.description)) out.set(key.description, { owner: o, key });
  }
  return out;
}

function serialize(logger: Bag, key: string, value: unknown): unknown {
  const fn = (logger[SERIALIZERS] as Record<string, (v: unknown) => unknown> | undefined)?.[key];
  try {
    return typeof fn === "function" ? fn(value) : value;
  } catch {
    return value;
  }
}

function attributesOf(logger: Bag, obj: Bag, keys: Keys): Record<string, unknown> {
  const messageKey = (keys.message && logger[keys.message]) || "msg";
  const errorKey = (keys.error && logger[keys.error]) || "err";
  const { pid: _pid, hostname: _host, ...bound } = typeof logger.bindings === "function" ? (logger.bindings as () => Bag)() : {};
  const out: Record<string, unknown> = bound;
  for (const [k, v] of Object.entries(obj)) if (k !== messageKey && k !== errorKey) out[k] = serialize(logger, k, v);
  return { ...out, ...errorAttributes(obj[errorKey as string]) };
}

function toEntry(logger: Bag, obj: unknown, msg: unknown, num: number, keys: Keys): LogEntry | null {
  const level = levelFromNumber(num);
  const fields = obj instanceof Error ? { err: obj } : ((obj ?? {}) as Bag);
  const messageKey = ((keys.message && logger[keys.message]) || "msg") as string;
  const message = String(msg ?? fields[messageKey] ?? (obj instanceof Error ? obj.message : ""));
  if (num <= 30 && FASTIFY_LINES.has(message)) return null;
  const attributes = attributesOf(logger, fields, keys);
  const category = typeof attributes.name === "string" ? attributes.name : "pino";
  return { level, category, message, attributes };
}

function wrap(original: Write, keys: Keys, sinks: Set<LogSink>): Write {
  return function (this: Bag, obj, msg, num) {
    if (sinks.size > 0) {
      try {
        const entry = toEntry(this, obj, msg, num, keys);
        if (entry) for (const sink of sinks) sink(entry);
      } catch {
        // A log line must never break the app.
      }
    }
    return original.call(this, obj, msg, num);
  };
}

/** Copy pino log lines into WizeLens: into the trace of the request they belong to, or (outside one) as loose lines. Covers every logger made by the same pino copy. */
export function instrumentPino(wizelens: WizeLens, logger: unknown): boolean {
  const sink = logSinkOf(wizelens);
  if (!sink || !logger || typeof logger !== "object") return false;
  const symbols = symbolsOf(logger);
  const write = symbols.get("pino.write");
  if (!write) return false;
  markDirect("pino");
  const sinks = patched.get(write.owner) ?? new Set<LogSink>();
  sinks.add(sink);
  addCleanup(wizelens, () => sinks.delete(sink));
  if (patched.has(write.owner)) return true;
  const owner = write.owner as Bag;
  const keys = { message: symbols.get("pino.messageKey")?.key, error: symbols.get("pino.errorKey")?.key };
  owner[write.key] = wrap(owner[write.key] as Write, keys, sinks);
  patched.set(write.owner, sinks);
  return true;
}
