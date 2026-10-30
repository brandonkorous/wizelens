import { rawService, type TimeWindow } from "@wizeworks/lens-core/internal";
import { useHost } from "../../data/host";
import { cloudResource, isAllProjects } from "../../data/projectScope";
import { useApi } from "../../data/useApi";
import type { ChartOutage } from "../../ui/OutageBands";

interface SendGap {
  startMs: number;
  endMs: number | null;
}

/** On the cloud, the times the service sent nothing, not even a heartbeat: red bands on its charts, so they never read as quiet. */
export function useSendGaps(name: string, window: TimeWindow): ChartOutage[] {
  const on = useHost().has("accounts") && !isAllProjects();
  const query = `?service=${encodeURIComponent(rawService(name))}&from=${Math.floor(window.from)}&to=${Math.ceil(window.to)}`;
  const { data } = useApi<{ gaps: SendGap[] }>(on ? cloudResource("service-gaps", query) : null);
  return (data?.gaps ?? []).map((g) => ({ startMs: g.startMs, endMs: g.endMs, label: `${name} not sending`, tone: "gap" as const }));
}

/** The series with no value in buckets wholly inside a gap: the line breaks there, not drops to zero. */
export function blankInGaps(values: readonly (number | null)[], starts: readonly number[], gaps: readonly ChartOutage[]): (number | null)[] {
  if (gaps.length === 0) return [...values];
  const step = starts.length > 1 ? starts[1]! - starts[0]! : 0;
  const inside = (from: number) => gaps.some((g) => g.startMs <= from && (g.endMs ?? Infinity) >= from + step);
  return values.map((v, i) => (starts[i] !== undefined && inside(starts[i]!) ? null : v));
}
