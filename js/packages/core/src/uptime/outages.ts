import type { UptimeIncidentView } from "./views.js";

/** Incidents that overlap `from`–`now`, oldest first: the outages a request SLO over that window could not see. */
export function outagesIn(incidents: readonly UptimeIncidentView[], fromMs: number, nowMs: number): UptimeIncidentView[] {
  return incidents.filter((i) => i.startMs < nowMs && (i.endMs ?? nowMs) > fromMs).sort((a, b) => a.startMs - b.startMs);
}
