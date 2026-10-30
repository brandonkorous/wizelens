// Runs the hub's alert rules on a timer, one round at a time, and drops values older than the history keeps.
import type { ResolvedHubOptions } from "../options.js";
import type { HubStore } from "../store.js";
import { evaluateHubAlerts, type HubAlertDeps } from "./evaluate.js";
import { pruneAlertValues } from "./store.js";

/** What the hub's alerts need: its file, how to send, and its address (known once it listens). */
export function hubAlertDeps(store: HubStore, o: ResolvedHubOptions, base: { url: string }): HubAlertDeps {
  return { store, outbox: { http: o.fetch, allowPrivate: o.allowPrivateTargets, pagerDutyUrl: o.pagerDutyUrl }, baseUrl: () => base.url };
}

/** Start the loop; returns a function that stops it. */
export function startAlertLoop(deps: HubAlertDeps, o: ResolvedHubOptions): () => void {
  let running = false;
  const round = async () => {
    if (running) return;
    running = true;
    try {
      const now = o.now();
      await evaluateHubAlerts(deps, now);
      pruneAlertValues(deps.store.db, now);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void round(), o.alertIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
