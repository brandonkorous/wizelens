import { useMemo } from "react";
import { type Capability, type HostMode, IN_APP_CAPABILITIES, type ServiceInfo, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import { useData } from "./provider";
import { useRangePref } from "./prefs";

/** Where this dashboard runs and what its host can do. Screens ask `has(...)`, never the mode name. */
export interface Host {
  mode: HostMode;
  has: (capability: Capability) => boolean;
  /** How long the host keeps traces. Longer time ranges are hidden. */
  keptMs: number;
  /** Time ranges that fit in what the host keeps. */
  ranges: TimeRange[];
  service: string | null;
}

const DAY_MS = 24 * 60 * 60_000;
const ALL_RANGES = Object.keys(TIME_RANGES) as TimeRange[];

export const MODE_LABEL: Record<HostMode, string> = { "in-app": "In-app", hub: "Local hub", cloud: "Cloud" };

export function hostOf(info: ServiceInfo | null): Host {
  const features = new Set<Capability>(info?.capabilities ?? IN_APP_CAPABILITIES);
  const keptMs = info?.storage?.maxAgeMs ?? DAY_MS;
  const ranges = ALL_RANGES.filter((r) => TIME_RANGES[r].ms <= keptMs);
  return {
    mode: info?.mode ?? "in-app",
    has: (c) => features.has(c),
    keptMs,
    ranges: ranges.length ? ranges : [ALL_RANGES[0]!],
    service: info?.service ?? null,
  };
}

export function useHost(): Host {
  const { info } = useData();
  return useMemo(() => hostOf(info), [info]);
}

/** The chosen time range, limited to what the host keeps. */
export function useRange(): [TimeRange, (r: TimeRange) => void] {
  const [range, setRange] = useRangePref();
  const { ranges } = useHost();
  return [ranges.includes(range) ? range : ranges[ranges.length - 1]!, setRange];
}

/** "24 h", "7 days", "45 min". */
export function fmtKept(ms: number): string {
  if (ms >= 2 * DAY_MS) return `${Math.round(ms / DAY_MS)} days`;
  if (ms >= 60 * 60_000) return `${Math.round(ms / (60 * 60_000))} h`;
  return `${Math.round(ms / 60_000)} min`;
}
