import type { StartDbSpan } from "../db.js";
import type { CaptureDeps } from "../request-capture.js";
import type { WizeLens } from "../types.js";

/** What adapters need from an enabled instance. */
export interface AdapterParts {
  dbSpans: StartDbSpan;
  capture: CaptureDeps;
}

const parts = new WeakMap<WizeLens, AdapterParts>();

/** Called once by createWizeLens. A disabled instance is never registered, so adapters do nothing. */
export function registerParts(wizelens: WizeLens, p: AdapterParts): void {
  parts.set(wizelens, p);
}

/** The database span factory of an enabled instance, or null. */
export const dbSpansOf = (wizelens: WizeLens): StartDbSpan | null => parts.get(wizelens)?.dbSpans ?? null;

/** Request capture of an enabled instance, or null. */
export const captureOf = (wizelens: WizeLens): CaptureDeps | null => parts.get(wizelens)?.capture ?? null;

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
