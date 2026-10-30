import { useState } from "react";
import type { OverviewModel } from "@wizeworks/lens-core/internal";
import { compareSeriesLabel, fmtCount, fmtMs } from "../../format";
import { Select } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { type ChartSeries, TimeChart } from "../../ui/TimeChart";

type Metric = "requests" | "duration";

const ERROR_BARS = "color-mix(in srgb, var(--wl-red) 45%, transparent)";

function chartOf(metric: Metric, a: OverviewModel["activity"], compare: "previous" | "week"): { lines: ChartSeries[]; bars: ChartSeries[] } {
  const errors: ChartSeries = { label: "Errors", values: a.errors, color: ERROR_BARS };
  const prev: ChartSeries = { label: compareSeriesLabel(compare), values: a.prevRequests, color: "var(--wl-slate)", dashed: true };
  if (metric === "requests") return { lines: [{ label: "Requests", values: a.requests, color: "var(--wl-blue)" }, prev], bars: [errors] };
  return { lines: [{ label: "Avg duration", values: a.avgDuration, color: "var(--wl-blue)" }], bars: [errors] };
}

/** Requests (or average duration) over time, with failed requests as bars. */
export function ActivityPanel({ m }: { m: OverviewModel }) {
  const [metric, setMetric] = useState<Metric>("requests");
  const chart = chartOf(metric, m.activity, m.meta.compare);
  const action = (
    <Select<Metric> small label="Chart metric" value={metric} onChange={setMetric} options={[["requests", "Requests"], ["duration", "Avg duration"]]} />
  );
  return (
    <Panel title="Request Activity" action={action}>
      {m.empty ? (
        <Empty title="No requests in this range">Use your app and requests show up here.</Empty>
      ) : (
        <TimeChart starts={m.activity.starts} lines={chart.lines} bars={chart.bars} height={220} separateBarScale format={metric === "requests" ? fmtCount : fmtMs} />
      )}
    </Panel>
  );
}
