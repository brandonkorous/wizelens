import { DEFAULT_LOOSE_LOGS, type LogLevel, type LooseLogOptions } from "@wizeworks/lens-core";

/** Log lines written outside a request (startup, background jobs, timers). */
export interface LogOptions {
  /** Keep lines written outside a request. Default true, or the WIZELENS_LOGS_OUTSIDE variable. */
  outside?: boolean;
  /** Lowest level kept for lines outside a request. Default "info", or the WIZELENS_LOGS_MIN_LEVEL variable. */
  minLevel?: LogLevel;
  /** Share of lines outside a request below "warn" that are kept, 0 to 1. Default 1, or the WIZELENS_LOGS_SAMPLE_RATE variable. */
  sampleRate?: number;
}

const LEVELS: Record<string, LogLevel> = {
  trace: "trace", debug: "debug", info: "info", information: "info", warn: "warn", warning: "warn", error: "error", critical: "critical", fatal: "critical",
};

const flag = (v: string | undefined): boolean | undefined => {
  const s = v?.trim().toLowerCase();
  return s === "true" || s === "1" || s === "on" || s === "yes" ? true : s === "false" || s === "0" || s === "off" || s === "no" ? false : undefined;
};

const rate = (v: string | number | undefined): number | undefined => {
  const n = typeof v === "number" ? v : v?.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined;
};

/** The options for lines outside a request: the given ones, then the variables, then the defaults. */
export function looseLogsOf(o: LogOptions = {}, env: NodeJS.ProcessEnv = process.env): LooseLogOptions {
  return {
    outside: o.outside ?? flag(env.WIZELENS_LOGS_OUTSIDE) ?? DEFAULT_LOOSE_LOGS.outside,
    minLevel: o.minLevel ?? LEVELS[env.WIZELENS_LOGS_MIN_LEVEL?.trim().toLowerCase() ?? ""] ?? DEFAULT_LOOSE_LOGS.minLevel,
    sampleRate: rate(o.sampleRate) ?? rate(env.WIZELENS_LOGS_SAMPLE_RATE) ?? DEFAULT_LOOSE_LOGS.sampleRate,
  };
}
