import { useCallback, useSyncExternalStore } from "react";
import { isTimeRange, type TimeRange } from "@wizeworks/lens-core/internal";

export type Theme = "light" | "dark" | "system";

export const KEYS = { theme: "wizelens.ui.theme", range: "wizelens.ui.range", seen: "wizelens.ui.seen" } as const;
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Hears writes of view choices (range, scope, period), so the address bar can carry them. */
let viewWriter: ((key: string, value: string) => void) | null = null;
export const onViewWrite = (fn: (key: string, value: string) => void): void => void (viewWriter = fn);

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  for (const l of listeners) l();
  viewWriter?.(key, value);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const memory = new Map<string, string>();

/** A preference's stored text, for code outside React. */
export const readPref = (key: string): string | null => memory.get(key) ?? read(key);

/** Store a preference and tell every reader. */
export function writePref(key: string, value: string): void {
  memory.set(key, value);
  write(key, value);
}

export function usePref<T extends string>(key: string, fallback: T, valid: (v: string) => v is T): [T, (v: T) => void] {
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

export const SCOPE = { env: "wizelens.ui.env", project: "wizelens.ui.project", service: "wizelens.ui.service", org: "wizelens.ui.org" } as const;
const isShortText = (v: string): v is string => v.length <= 100;

/** Filters: one environment and one project. "" means all (hub); the cloud's "all" is every project of the current organization. */
export const useEnvScope = () => usePref<string>(SCOPE.env, "", isShortText);
export const useProjectScope = () => usePref<string>(SCOPE.project, "", isShortText);
/** Cloud: the organization the dashboard shows. */
export const useOrgScope = () => usePref<string>(SCOPE.org, "", isShortText);
/** The service every page filters by (a display name, for example "Web App"); "" means all. */
export const useServiceScope = () => usePref<string>(SCOPE.service, "", isShortText);

export interface Scope {
  env: string;
  project: string;
  service: string;
  /** Cloud: the current organization. */
  org: string;
}

/** The filters, for code outside React. */
export const getScope = (): Scope => ({
  env: memory.get(SCOPE.env) ?? read(SCOPE.env) ?? "",
  project: memory.get(SCOPE.project) ?? read(SCOPE.project) ?? "",
  service: memory.get(SCOPE.service) ?? read(SCOPE.service) ?? "",
  org: memory.get(SCOPE.org) ?? read(SCOPE.org) ?? "",
});

/** Pick the project. A service picked in another project is not in this one, so the service filter is cleared. */
export function setProjectScope(id: string): void {
  if (id === (memory.get(SCOPE.project) ?? read(SCOPE.project) ?? "")) return;
  writePref(SCOPE.service, "");
  writePref(SCOPE.project, id);
}

/** Pick the organization outside React. */
export function setOrgScope(id: string): void {
  memory.set(SCOPE.org, id);
  write(SCOPE.org, id);
}

/** Hear any preference change. */
export const onPrefChange = subscribe;

/** Put the theme on <html> so the CSS tokens switch. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
