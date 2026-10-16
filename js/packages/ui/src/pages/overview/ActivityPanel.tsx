import { useMemo, useState } from "react";
import { type RequestRow, requestActivity, series, type TimeWindow, ACTIVITY_BUCKETS } from "@wizeworks/lens-core";
import { fmtCount, fmtMs } from "../../format";
import { Select } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { type ChartSeries, TimeChart } from "../../ui/TimeChart";

type Metric = "requests" | "duration";

const ERROR_BARS = "color-mix(in srgb, var(--wl-red) 45%, transparent)";

function chartOf(metric: Metric, rows: readonly RequestRow[], w: TimeWindow): { starts: number[]; lines: ChartSeries[]; bars: ChartSeries[] } {
  const a = requestActivity(rows, w);
  const errors: ChartSeries = { label: "Errors", values: a.errors, color: ERROR_BARS };
  if (metric === "requests") return { starts: a.starts, lines: [{ label: "Requests", values: a.requests, color: "var(--wl-blue)" }], bars: [errors] };
  const avg = series(rows, (r) => r.startMs, w, ACTIVITY_BUCKETS, "avg", (r) => r.durationMs);
  return { starts: a.starts, lines: [{ label: "Avg duration", values: avg, color: "var(--wl-blue)" }], bars: [errors] };
}

/** Requests (or average duration) over time, with failed requests as bars. */
export function ActivityPanel({ rows, window }: { rows: readonly RequestRow[]; window: TimeWindow }) {
  const [metric, setMetric] = useState<Metric>("requests");
  const chart = useMemo(() => chartOf(metric, rows, window), [metric, rows, window]);
  const action = (
    <Select<Metric> small label="Chart metric" value={metric} onChange={setMetric} options={[["requests", "Requests"], ["duration", "Avg duration"]]} />
  );
  return (
    <Panel title="Request Activity" action={action}>
      {rows.length === 0 ? (
        <Empty title="No requests in this range">Use your app and requests show up here.</Empty>
      ) : (
        <TimeChart starts={chart.starts} lines={chart.lines} bars={chart.bars} height={220} separateBarScale format={metric === "requests" ? fmtCount : fmtMs} />
      )}
    </Panel>
  );
}
