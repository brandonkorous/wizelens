import { useCallback, useSyncExternalStore } from "react";
import { isTimeRange, type TimeRange } from "@wizeworks/lens-core";

export type Theme = "light" | "dark" | "system";

const KEYS = { theme: "wizelens.ui.theme", range: "wizelens.ui.range", seen: "wizelens.ui.seen" } as const;
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const memory = new Map<string, string>();

function usePref<T extends string>(key: string, fallback: T, valid: (v: string) => v is T): [T, (v: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => memory.get(key) ?? read(key));
  const value = raw !== null && valid(raw) ? raw : fallback;
  const set = useCallback(
    (v: T) => {
      memory.set(key, v);
      write(key, v);
    },
    [key],
  );
  return [value, set];
}

const isTheme = (v: string): v is Theme => v === "light" || v === "dark" || v === "system";
const isEpoch = (v: string): v is string => /^\d+$/.test(v);

export const useTheme = () => usePref<Theme>(KEYS.theme, "light", isTheme);
export const useRangePref = () => usePref<TimeRange>(KEYS.range, "24h", isTimeRange);

/** When the user last opened the notifications (epoch ms as a string). */
export const useSeenPref = () => usePref<string>(KEYS.seen, "0", isEpoch);

const SCOPE = { env: "wizelens.ui.env", project: "wizelens.ui.project" } as const;
const isShortText = (v: string): v is string => v.length <= 100;

/** Hub filters: one environment and one project. "" means all. */
export const useEnvScope = () => usePref<string>(SCOPE.env, "", isShortText);
export const useProjectScope = () => usePref<string>(SCOPE.project, "", isShortText);

export interface Scope {
  env: string;
  project: string;
}

/** The hub filters, for code outside React. */
export const getScope = (): Scope => ({
  env: memory.get(SCOPE.env) ?? read(SCOPE.env) ?? "",
  project: memory.get(SCOPE.project) ?? read(SCOPE.project) ?? "",
});

/** Hear any preference change. */
export const onPrefChange = subscribe;

/** Put the theme on <html> so the CSS tokens switch. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
