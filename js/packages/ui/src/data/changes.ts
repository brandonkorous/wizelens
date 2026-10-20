import { useEffect, useSyncExternalStore } from "react";
import { useHost } from "./host";
import { getScope } from "./prefs";
import { checkRelease } from "./release";
import { projectQuery } from "./projectScope";

// Live reloads on hosts with the "changes" capability: one event stream per tab, shared by every page, and a counter that moves when the project gets new data.
const shared = { url: "", stream: null as EventSource | null, users: 0, tick: 0, subs: new Set<() => void>() };

function acquire(url: string): void {
  if (shared.url !== url) {
    shared.stream?.close();
    shared.url = url;
    shared.stream = new EventSource(url);
    shared.stream.addEventListener("data", () => ((shared.tick += 1), shared.subs.forEach((fn) => fn())));
    // The stream opens again after the host restarts, which is when a new release lands.
    shared.stream.addEventListener("open", () => void checkRelease());
  }
  shared.users += 1;
}

function release(): void {
  shared.users -= 1;
  if (shared.users > 0) return;
  shared.stream?.close();
  shared.stream = null;
  shared.url = "";
}

const subscribe = (fn: () => void) => (shared.subs.add(fn), () => void shared.subs.delete(fn));

/** A number that grows each time the host says the project has new data; 0 on hosts without the stream. */
export function useChangeTick(): number {
  const live = useHost().has("changes") && typeof EventSource !== "undefined";
  const project = projectQuery();
  const url = live ? `./api/changes${project ? `?${project}` : ""}` : null;
  useEffect(() => {
    if (!url) return;
    acquire(url);
    return release;
  }, [url]);
  return useSyncExternalStore(subscribe, () => shared.tick);
}
