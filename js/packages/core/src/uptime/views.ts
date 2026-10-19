// What the uptime API and the public status page send: checks with their uptime, and incidents with check names.
import type { UptimeCheck, UptimeIncident } from "./check.js";
import { shownHeaders } from "./input.js";
import { dailyUptime, type UptimeWindow, uptimeWindows } from "./percent.js";

export interface UptimeCheckView extends UptimeCheck {
  uptime: Record<UptimeWindow, number | null>;
}

export interface UptimeIncidentView extends UptimeIncident {
  checkName: string;
}

/** `GET api/uptime` (hub) and `GET api/projects/<id>/uptime` (cloud). */
export interface UptimeList {
  checks: UptimeCheckView[];
  /** Newest first, at most 100. */
  incidents: UptimeIncidentView[];
  nowMs: number;
}

/** Days of bars on the public status page. */
export const STATUS_DAYS = 30;

export interface StatusCheckView {
  name: string;
  state: UptimeCheck["state"];
  uptime: Record<UptimeWindow, number | null>;
  /** One per day, oldest first. */
  days: (number | null)[];
}

/** `GET api/status/<token>`: what anyone with the link sees. No URLs, headers, or error details. */
export interface StatusPageView {
  title: string;
  checks: StatusCheckView[];
  incidents: { checkName: string; startMs: number; endMs: number | null }[];
  nowMs: number;
}

const byCheck = (incidents: readonly UptimeIncident[]) => {
  const out = new Map<string, UptimeIncident[]>();
  for (const i of incidents) out.set(i.checkId, [...(out.get(i.checkId) ?? []), i]);
  return out;
};

/** The list for the dashboard. Secret-looking header values are hidden. */
export function uptimeList(checks: readonly UptimeCheck[], incidents: readonly UptimeIncident[], now: number): UptimeList {
  const per = byCheck(incidents);
  const names = new Map(checks.map((c) => [c.id, c.name]));
  return {
    checks: checks.map((c) => ({ ...c, headers: shownHeaders(c.headers), uptime: uptimeWindows(c, per.get(c.id) ?? [], now) })),
    incidents: [...incidents].sort((a, b) => b.startMs - a.startMs).slice(0, 100).map((i) => ({ ...i, checkName: names.get(i.checkId) ?? i.checkId })),
    nowMs: now,
  };
}

/** The public page: enabled checks only, with bars per day and incidents of the last 30 days. */
export function statusPageView(title: string, checks: readonly UptimeCheck[], incidents: readonly UptimeIncident[], now: number): StatusPageView {
  const shown = checks.filter((c) => c.enabled);
  const per = byCheck(incidents);
  const names = new Map(shown.map((c) => [c.id, c.name]));
  const since = now - STATUS_DAYS * 86_400_000;
  return {
    title,
    checks: shown.map((c) => ({ name: c.name, state: c.state, uptime: uptimeWindows(c, per.get(c.id) ?? [], now), days: dailyUptime(c, per.get(c.id) ?? [], STATUS_DAYS, now) })),
    incidents: incidents
      .filter((i) => names.has(i.checkId) && (i.endMs ?? now) >= since)
      .sort((a, b) => b.startMs - a.startMs)
      .slice(0, 50)
      .map((i) => ({ checkName: names.get(i.checkId)!, startMs: i.startMs, endMs: i.endMs })),
    nowMs: now,
  };
}
