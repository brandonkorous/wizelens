// Uptime percentages from incidents: the share of time a check was not down. Exact, and free of telemetry retention.
import type { UptimeCheck, UptimeIncident } from "./check.js";

const DAY_MS = 86_400_000;

/** The windows uptime is reported over. */
export const UPTIME_WINDOWS = { "24h": DAY_MS, "7d": 7 * DAY_MS, "30d": 30 * DAY_MS } as const;
export type UptimeWindow = keyof typeof UPTIME_WINDOWS;

/** Incidents are kept this long, so the longest window always has them. */
export const UPTIME_KEEP_MS = 90 * DAY_MS;

/** Milliseconds of incidents inside [from, to). An open incident lasts until `now`. */
export function downMs(incidents: readonly UptimeIncident[], from: number, to: number, now: number): number {
  let total = 0;
  for (const i of incidents) total += Math.max(0, Math.min(to, i.endMs ?? now) - Math.max(from, i.startMs));
  return total;
}

/** Uptime in percent over [from, to), counted from the check's first run. Null when it had not run yet in that time. */
export function uptimeOver(check: Pick<UptimeCheck, "createdMs" | "lastRunMs">, incidents: readonly UptimeIncident[], from: number, to: number, now: number): number | null {
  const start = Math.max(from, check.createdMs);
  const end = Math.min(to, now);
  if (check.lastRunMs === null || end <= start) return null;
  return Math.max(0, 100 - (downMs(incidents, start, end, now) / (end - start)) * 100);
}

/** Uptime for 24 hours, 7 days, and 30 days, ending now. */
export function uptimeWindows(check: Pick<UptimeCheck, "createdMs" | "lastRunMs">, incidents: readonly UptimeIncident[], now: number): Record<UptimeWindow, number | null> {
  const out = {} as Record<UptimeWindow, number | null>;
  for (const [w, ms] of Object.entries(UPTIME_WINDOWS) as [UptimeWindow, number][]) out[w] = uptimeOver(check, incidents, now - ms, now, now);
  return out;
}

/** One bar per day for the last `days` days (oldest first), each the uptime of that UTC day. */
export function dailyUptime(check: Pick<UptimeCheck, "createdMs" | "lastRunMs">, incidents: readonly UptimeIncident[], days: number, now: number): (number | null)[] {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  return Array.from({ length: days }, (_, i) => {
    const from = today - (days - 1 - i) * DAY_MS;
    return uptimeOver(check, incidents, from, from + DAY_MS, now);
  });
}

/** How long an incident lasted (or has lasted so far). */
export const incidentMs = (i: UptimeIncident, now: number): number => Math.max(0, (i.endMs ?? now) - i.startMs);
