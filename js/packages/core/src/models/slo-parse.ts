// Checks an SLO and Apdex targets from a request body.
import type { ApdexTargets } from "./apdex.js";
import { SLO_WINDOWS, type SloInput } from "./slo.js";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The SLO in a body, or why it is not valid. Merge a change over the current SLO first. */
export function parseSlo(b: Record<string, unknown>): SloInput | string {
  const service = text(b.service, 100);
  if (!service) return "Pick the service the SLO covers.";
  if (b.kind !== "success" && b.kind !== "latency") return 'Set kind to "success" or "latency".';
  const target = Number(b.target);
  if (!Number.isFinite(target) || target <= 0 || target >= 100) return "Set target to a percent above 0 and below 100, for example 99.9.";
  const thresholdMs = b.kind === "latency" ? Number(b.thresholdMs) : 0;
  if (b.kind === "latency" && (!Number.isFinite(thresholdMs) || thresholdMs <= 0)) return "Set thresholdMs: requests at or under it count as good.";
  const windowDays = Number(b.windowDays ?? 30);
  if (!SLO_WINDOWS.includes(windowDays as 7 | 30)) return "Pick a window of 7 or 30 days.";
  const name = text(b.name, 100) || `${service} ${b.kind === "success" ? "availability" : "latency"}`;
  return { name, service, endpoint: text(b.endpoint, 300), kind: b.kind, target, thresholdMs, windowDays: windowDays as 7 | 30 };
}

/** Apdex targets: service name to ms (1 ms to 60 s), at most 200 services. */
export function parseApdexTargets(raw: unknown): ApdexTargets | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "Send { apdex: { service: ms } }.";
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 200) return "At most 200 services.";
  const out: Record<string, number> = {};
  for (const [service, ms] of entries) {
    const v = Number(ms);
    if (!service.trim() || service.length > 100 || !Number.isFinite(v) || v < 1 || v > 60_000) return `${service}: set 1 to 60000 ms.`;
    out[service.trim()] = Math.round(v);
  }
  return out;
}
