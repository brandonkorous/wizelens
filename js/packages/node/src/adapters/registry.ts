import type { StartDbSpan } from "../db.js";
import type { LogSink } from "../logger.js";
import type { MetricStore } from "../metrics/store.js";
import type { CaptureDeps } from "../request-capture.js";
import type { WizeLens } from "../types.js";

/** What adapters need from an enabled instance. */
export interface AdapterParts {
  dbSpans: StartDbSpan;
  capture: CaptureDeps;
  logs: LogSink;
  /** Null when metrics are off. */
  metrics: MetricStore | null;
}

const parts = new WeakMap<WizeLens, AdapterParts>();
const cleanups = new WeakMap<WizeLens, (() => void)[]>();

/** Run `fn` when the instance shuts down, for example to unhook a logger. */
export function addCleanup(wizelens: WizeLens, fn: () => void): void {
  const list = cleanups.get(wizelens) ?? [];
  list.push(fn);
  cleanups.set(wizelens, list);
}

/** Run and forget the cleanups of one instance. */
export function runCleanups(wizelens: WizeLens): void {
  for (const fn of cleanups.get(wizelens) ?? []) fn();
  cleanups.delete(wizelens);
}

/** Called once by createWizeLens. A disabled instance is never registered, so adapters do nothing. */
export function registerParts(wizelens: WizeLens, p: AdapterParts): void {
  parts.set(wizelens, p);
}

/** The database span factory of an enabled instance, or null. */
export const dbSpansOf = (wizelens: WizeLens): StartDbSpan | null => parts.get(wizelens)?.dbSpans ?? null;

/** Request capture of an enabled instance, or null. */
export const captureOf = (wizelens: WizeLens): CaptureDeps | null => parts.get(wizelens)?.capture ?? null;

/** The metric store of an enabled instance with metrics on, or null. */
export const metricsOf = (wizelens: WizeLens): MetricStore | null => parts.get(wizelens)?.metrics ?? null;

/** The log sink of an enabled instance, or null. */
export const logSinkOf = (wizelens: WizeLens): LogSink | null => parts.get(wizelens)?.logs ?? null;

type Method = (...args: unknown[]) => unknown;

/** Replace `target[name]` once per `kind`. Patching the same method twice is a no-op. */
export function patchMethod<T extends object>(target: T, name: string, wrap: (original: Method) => Method, kind = "traced"): boolean {
  const marker = Symbol.for(`wizeworks.wizelens.${kind}`);
  const record = target as Record<string | symbol, unknown>;
  const original = record[name];
  if (typeof original !== "function" || (original as unknown as Record<symbol, unknown>)[marker]) return false;
  const wrapped = wrap(original as Method);
  Object.defineProperty(wrapped, marker, { value: true });
  record[name] = wrapped;
  return true;
}
