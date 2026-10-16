import { useCallback, useSyncExternalStore } from "react";

// Values written while storage is blocked, so a setting still lasts for this page.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export function readStored(key: string): string | null {
  const kept = memory.get(key);
  if (kept !== undefined) return kept;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the memory copy keeps the setting for this page.
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const serverValue = () => null;

/** A HUD setting kept in localStorage. Server render and hydration use the fallback, so the HTML matches; the stored value applies after. */
export function useStored<T extends string>(key: string, fallback: T, valid: (v: string) => v is T): [T, (v: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => readStored(key), serverValue);
  const value = raw !== null && valid(raw) ? raw : fallback;
  const set = useCallback((v: T) => writeStored(key, v), [key]);
  return [value, set];
}

const isFlag = (v: string): v is "1" | "0" => v === "1" || v === "0";

export function useFlag(key: string, fallback: boolean): [boolean, (on: boolean) => void] {
  const [v, set] = useStored(key, fallback ? "1" : "0", isFlag);
  return [v === "1", useCallback((on: boolean) => set(on ? "1" : "0"), [set])];
}

/** Test hook: forget values kept in memory. */
export function resetStoredMemory(): void {
  memory.clear();
}
