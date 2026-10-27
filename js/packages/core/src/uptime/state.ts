// What a run changes: the check's state, and whether an incident opens or closes. Hubs and the cloud store the answer.
import type { UptimeCheck, UptimeResult } from "./check.js";

export interface UptimeChange {
  state: "up" | "down";
  /** Open an incident with this reason (the check just went down). */
  open: string | null;
  /** Close the open incident at this time (the check just came back). */
  closeAtMs: number | null;
}

/** The change one run makes. Pending checks that fail open an incident; pending checks that pass do not close one. */
export function changeOf(check: Pick<UptimeCheck, "state">, r: UptimeResult): UptimeChange {
  if (r.ok) return { state: "up", open: null, closeAtMs: check.state === "down" ? r.startMs : null };
  return { state: "down", open: check.state === "down" ? null : (r.error ?? "Failed"), closeAtMs: null };
}

/** The row fields one run sets on its check. The first run moves `createdMs` to itself, so uptime counts only time a run has seen. */
export function lastRunOf(check: Pick<UptimeCheck, "createdMs" | "lastRunMs">, r: UptimeResult): Pick<UptimeCheck, "state" | "createdMs" | "lastRunMs" | "lastDurationMs" | "lastStatus" | "lastError" | "tlsExpiresMs"> {
  return { state: r.ok ? "up" : "down", createdMs: check.lastRunMs === null ? r.startMs : check.createdMs, lastRunMs: r.startMs, lastDurationMs: r.durationMs, lastStatus: r.status, lastError: r.error, tlsExpiresMs: r.tlsExpiresMs };
}

/** When a check runs next: one interval after its last run, or now when it never ran. */
export const nextRunMs = (c: Pick<UptimeCheck, "lastRunMs" | "intervalMin">, now: number): number => (c.lastRunMs === null ? now : c.lastRunMs + c.intervalMin * 60_000);
