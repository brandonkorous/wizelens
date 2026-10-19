import { useSyncExternalStore } from "react";

// A new release of the dashboard: the page keeps running and offers a refresh, instead of breaking when its files change on the server.
declare const __WL_BUILD__: string;

const CHECK_MS = 5 * 60_000;
const state = { build: "", dismissed: "", subs: new Set<() => void>() };

function found(build: string): void {
  if (state.build === build) return;
  state.build = build;
  state.subs.forEach((fn) => fn());
}

/** Ask the server which build it serves now. Quiet on any failure: an old host has no version.json. */
export async function checkRelease(): Promise<void> {
  try {
    const res = await fetch("./version.json", { cache: "no-store" });
    const body = res.ok ? ((await res.json()) as { build?: unknown }) : null;
    if (typeof body?.build === "string" && body.build !== __WL_BUILD__) found(body.build);
  } catch {
    // Offline, or not JSON: try again later.
  }
}

/** A file of this build failed to load (the server has a newer build): offer the refresh. */
export function releaseMissing(): void {
  found(state.build || "unknown");
}

/** Hide the notice until a newer build than this one shows up. */
export function dismissRelease(): void {
  state.dismissed = state.build;
  state.subs.forEach((fn) => fn());
}

export function startReleaseChecks(): void {
  window.addEventListener("vite:preloadError", (e) => (e.preventDefault(), releaseMissing()));
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void checkRelease());
  setInterval(() => document.visibilityState === "visible" && void checkRelease(), CHECK_MS);
}

const subscribe = (fn: () => void) => (state.subs.add(fn), () => void state.subs.delete(fn));

/** True when a newer build is ready and the notice was not dismissed for it. */
export function useReleaseReady(): boolean {
  return useSyncExternalStore(subscribe, () => !!state.build && state.build !== state.dismissed);
}
