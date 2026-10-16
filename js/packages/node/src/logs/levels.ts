import { formatWithOptions } from "node:util";
import type { LogLevel } from "@wizeworks/lens-core";

/** Pino and bunyan numbers: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal. */
export function levelFromNumber(n: number): LogLevel {
  if (n <= 10) return "trace";
  if (n <= 20) return "debug";
  if (n <= 30) return "info";
  if (n <= 40) return "warn";
  if (n <= 50) return "error";
  return "critical";
}

/** OpenTelemetry severity numbers: 1-4 trace, 5-8 debug, 9-12 info, 13-16 warn, 17-20 error, 21-24 fatal. */
export function levelFromSeverity(n: number | undefined): LogLevel {
  if (!n) return "info";
  return (["trace", "debug", "info", "warn", "error", "critical"] as const)[Math.min(5, Math.floor((n - 1) / 4))]!;
}

const NAMES: Record<string, LogLevel> = {
  silly: "trace",
  trace: "trace",
  verbose: "debug",
  debug: "debug",
  log: "info",
  info: "info",
  http: "info",
  notice: "info",
  success: "info",
  ready: "info",
  start: "info",
  box: "info",
  warn: "warn",
  warning: "warn",
  error: "error",
  fail: "error",
  crit: "critical",
  critical: "critical",
  alert: "critical",
  emerg: "critical",
  fatal: "critical",
  mark: "info",
};

/** Level names from winston, log4js, consola, NestJS, and syslog. Unknown names are "info". */
export const levelFromName = (name: unknown): LogLevel => NAMES[String(name).toLowerCase()] ?? "info";

/** Format arguments the way `console.log` does, without colors. */
export const formatArgs = (args: readonly unknown[]): string => formatWithOptions({ colors: false, depth: 4 }, ...args);

/** OTel exception attributes for an Error, or nothing. */
export function errorAttributes(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return {};
  return { "exception.type": err.name, "exception.message": err.message, "exception.stacktrace": err.stack ?? null };
}

/** The first Error in a list of arguments. */
export const firstError = (args: readonly unknown[]): Error | undefined => args.find((a) => a instanceof Error) as Error | undefined;
