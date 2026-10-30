import type { LogLevel, LogRecord } from "@wizeworks/lens-core/internal";
import { browserAppAttrs, type ViewRef } from "./browser-span.js";
import { now } from "./session.js";

/** A browser log line, sent with the browser spans. */
export type ClientLog = LogRecord & { traceId: string };

type Method = "log" | "info" | "warn" | "error" | "debug" | "trace";
type Fn = (...args: unknown[]) => void;

const METHODS: Record<Method, LogLevel> = { log: "info", info: "info", warn: "warn", error: "error", debug: "debug", trace: "trace" };
// Stop after this many lines per page, so a loop cannot flood the server.
const MAX_LOGS = 500;
const MAX_MESSAGE = 4000;

function show(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Format arguments like the console: `%s`, `%d`, `%i`, `%f`, `%o`, `%O`, `%j` are filled, `%c` styles are dropped. */
export function formatConsole(args: readonly unknown[]): string {
  const rest = [...args];
  let head = typeof rest[0] === "string" ? (rest.shift() as string) : "";
  head = head.replace(/%[sdifoOjc%]/g, (t) => {
    if (t === "%%") return "%";
    if (rest.length === 0) return t;
    const v = rest.shift();
    if (t === "%c") return "";
    if (t === "%d" || t === "%i") return String(Math.trunc(Number(v)));
    if (t === "%f") return String(Number(v));
    return show(v);
  });
  return [head, ...rest.map(show)].filter((s) => s !== "").join(" ").slice(0, MAX_MESSAGE);
}

function attributesOf(args: readonly unknown[]): Record<string, string | null> {
  const err = args.find((a) => a instanceof Error) as Error | undefined;
  return err ? { "exception.type": err.name, "exception.message": err.message, "exception.stacktrace": err.stack ?? null } : {};
}

/** Copy `console.*` calls into the current page view's trace. Returns a stop function. */
export function watchConsole(view: () => ViewRef, push: (log: ClientLog) => void): () => void {
  if (typeof console === "undefined") return () => {};
  let count = 0;
  let watching = true;
  const wrapped = new Map<Method, { original: Fn; wrapper: Fn }>();
  for (const [name, level] of Object.entries(METHODS) as [Method, LogLevel][]) {
    const original = console[name] as Fn;
    const wrapper: Fn = function (this: unknown, ...args) {
      if (watching && ++count <= MAX_LOGS) {
        const v = view();
        const message = formatConsole(args);
        push({ traceId: v.traceId, spanId: v.spanId, timeMs: now(), level, category: "console", message, service: "browser", attributes: { ...browserAppAttrs(), ...attributesOf(args) } });
      }
      return original.apply(this, args);
    };
    wrapped.set(name, { original, wrapper });
    console[name] = wrapper;
  }
  return () => {
    watching = false;
    // Leave a method alone when something else wrapped it after us; ours then passes through.
    for (const [name, { original, wrapper }] of wrapped) if (console[name] === wrapper) console[name] = original;
  };
}
