import type { LogLevel } from "@wizeworks/lens-core/internal";
import { isQuiet, type LogSink } from "../logger.js";
import { errorAttributes, firstError, formatArgs } from "./levels.js";

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug" | "trace";

const METHODS: Record<ConsoleMethod, LogLevel> = { log: "info", info: "info", warn: "warn", error: "error", debug: "debug", trace: "trace" };
const sinks = new Set<LogSink>();
type Fn = (...args: unknown[]) => void;
const originals = new Map<ConsoleMethod, { original: Fn; wrapped: Fn }>();
let busy = false;

function capture(level: LogLevel, args: unknown[]): void {
  if (busy || isQuiet() || sinks.size === 0) return;
  busy = true;
  try {
    const entry = { level, category: "console", message: formatArgs(args), attributes: errorAttributes(firstError(args)) };
    // WizeLens's own notices ("[wizelens] ...") are not app lines.
    if (!entry.message.startsWith("[wizelens]")) for (const sink of sinks) sink(entry);
  } finally {
    busy = false;
  }
}

function patch(): void {
  for (const [name, level] of Object.entries(METHODS) as [ConsoleMethod, LogLevel][]) {
    const original = console[name] as Fn;
    const wrapped = function (this: unknown, ...args: unknown[]) {
      capture(level, args);
      return original.apply(this, args);
    };
    originals.set(name, { original, wrapped });
    console[name] = wrapped;
  }
}

function unpatch(): void {
  // Leave a method alone when something else wrapped it after us.
  for (const [name, { original, wrapped }] of originals) if (console[name] === wrapped) console[name] = original;
  originals.clear();
}

/** Copy `console.*` calls into WizeLens: into the trace of their request, or (outside one) as loose lines. Returns a stop function. */
export function captureConsole(sink: LogSink): () => void {
  if (sinks.size === 0) patch();
  sinks.add(sink);
  return () => {
    if (!sinks.delete(sink) || sinks.size > 0) return;
    unpatch();
  };
}
