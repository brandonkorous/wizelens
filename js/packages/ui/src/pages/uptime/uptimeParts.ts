import type { UptimeCheck, UptimeCheckStats, UptimeModel } from "@wizeworks/lens-core";
import type { Tone } from "../../ui/Badges";

/** "99.95%", "100%", or a dash before a check has run. Uptime keeps two decimals: 99.9 and 99.99 are far apart. */
export function fmtUptime(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "–";
  if (pct >= 100) return "100%";
  return `${(Math.floor(pct * 100) / 100).toFixed(2)}%`;
}

/** How a check's state shows, and where it sorts: down first, then pending, up, and off. */
export function stateOf(c: Pick<UptimeCheck, "enabled" | "state">): { label: string; tone: Tone; rank: number } {
  if (!c.enabled) return { label: "Off", tone: "neutral", rank: 3 };
  if (c.state === "down") return { label: "Down", tone: "danger", rank: 0 };
  if (c.state === "pending") return { label: "Pending", tone: "info", rank: 1 };
  return { label: "Up", tone: "success", rank: 2 };
}

/** The page model's numbers for one check, when it ran in the range. */
export const statsOf = (model: UptimeModel | null, id: string): UptimeCheckStats | undefined => model?.checks.find((c) => c.checkId === id);

/** "1 h 5 min", "3 min", "45 s". */
export function fmtLength(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return `${Math.floor(h / 24)} days`;
}

/** Tone for an uptime percentage: green at 99.9% and up, amber at 99% and up, red below. */
export const toneOfUptime = (pct: number | null): Tone => (pct === null ? "neutral" : pct >= 99.9 ? "success" : pct >= 99 ? "warning" : "danger");
