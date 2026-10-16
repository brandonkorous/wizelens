import { useMemo } from "react";
import {
  inWindow,
  previousWindow,
  type RequestRow,
  requestRows,
  TIME_RANGES,
  type TimeRange,
  type TimeWindow,
  type Trace,
  windowOf,
} from "@wizeworks/lens-core";
import { useRange } from "./host";
import { useData } from "./provider";

export { useData };

/** Everything a page needs for the selected time range, and the same for the range before it. */
export interface Windowed {
  range: TimeRange;
  /** Label for comparisons, for example "vs. previous day". */
  compareLabel: string;
  window: TimeWindow;
  prev: TimeWindow;
  traces: Trace[];
  prevTraces: Trace[];
  requests: RequestRow[];
  prevRequests: RequestRow[];
  /** All traces, for pages that look past the window. */
  all: Trace[];
  loading: boolean;
}

const COMPARE: Record<TimeRange, string> = {
  "15m": "vs. previous 15 min",
  "1h": "vs. previous hour",
  "6h": "vs. previous 6 hours",
  "24h": "vs. previous day",
};

function slice(traces: readonly Trace[], range: TimeRange, now: number): Omit<Windowed, "loading" | "all"> {
  const window = windowOf(range, now);
  const prev = previousWindow(window);
  const cur = traces.filter((t) => inWindow(t.startMs, window));
  const before = traces.filter((t) => inWindow(t.startMs, prev));
  return {
    range,
    compareLabel: COMPARE[range],
    window,
    prev,
    traces: cur,
    prevTraces: before,
    requests: requestRows(cur),
    prevRequests: requestRows(before),
  };
}

export function useWindowed(): Windowed {
  const data = useData();
  const [range] = useRange();
  return useMemo(
    () => ({ ...slice(data.traces, range, data.updatedMs), all: data.traces, loading: data.loading }),
    [data.traces, data.updatedMs, data.loading, range],
  );
}

export const rangeLabel = (r: TimeRange) => TIME_RANGES[r].label;
