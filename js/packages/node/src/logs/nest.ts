import type { LogLevel } from "@wizeworks/lens-core/internal";
import { logSinkOf } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";
import { errorAttributes, formatArgs } from "./levels.js";

type NestMethod = "log" | "error" | "warn" | "debug" | "verbose" | "fatal";
type NestLogger = Partial<Record<NestMethod, (message: unknown, ...params: unknown[]) => unknown>> & Record<string, unknown>;

const LEVELS: Record<NestMethod, LogLevel> = { log: "info", error: "error", warn: "warn", debug: "debug", verbose: "trace", fatal: "critical" };
const STACK = /\n\s+at /;

/** Split NestJS arguments: the last string is the context, a stack-like string is the stack. */
function split(method: NestMethod, params: unknown[]) {
  const rest = [...params];
  const context = typeof rest.at(-1) === "string" && !STACK.test(rest.at(-1) as string) ? (rest.pop() as string) : undefined;
  const stack = method === "error" || method === "fatal" ? rest.find((p) => typeof p === "string" && STACK.test(p)) : undefined;
  return { context, stack: stack as string | undefined, rest: rest.filter((p) => p !== stack) };
}

/** A NestJS logger that copies lines into the request's trace and passes them on to `inner`. */
export function nestLogger<T extends object>(wizelens: WizeLens, inner?: T): T & Record<NestMethod, (message: unknown, ...params: unknown[]) => void> {
  const target = (inner ?? {}) as NestLogger;
  const out = Object.create(target) as NestLogger;
  for (const method of Object.keys(LEVELS) as NestMethod[]) {
    out[method] = (message: unknown, ...params: unknown[]) => {
      target[method]?.call(target, message, ...params);
      const enabled = target.isLevelEnabled as ((level: string) => boolean) | undefined;
      if (typeof enabled === "function" && !enabled.call(target, method)) return;
      const { context, stack, rest } = split(method, params);
      const err = message instanceof Error ? message : undefined;
      logSinkOf(wizelens)?.({
        level: LEVELS[method],
        category: context ?? "nest",
        message: formatArgs([err ? err.message : message, ...rest]),
        attributes: { ...errorAttributes(err), ...(stack ? { "exception.stacktrace": stack } : {}) },
      });
    };
  }
  return out as T & Record<NestMethod, (message: unknown, ...params: unknown[]) => void>;
}
