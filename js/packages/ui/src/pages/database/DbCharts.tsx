import { useState } from "react";
import { series } from "@wizeworks/lens-core";
import { fmtMs } from "../../format";
import { BarList } from "../../ui/BarList";
import { Select } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { TimeChart } from "../../ui/TimeChart";
import { CHART_BUCKETS, type DatabaseStats } from "./useDatabaseStats";

type Metric = "slow" | "avg";

export function SlowQueriesPanel({ stats }: { stats: DatabaseStats }) {
  const [metric, setMetric] = useState<Metric>("slow");
  const { calls, w, starts, slowMs } = stats;
  const total = series(calls, (c) => c.startMs, w.window, CHART_BUCKETS);
  const line =
    metric === "slow"
      ? { label: `Slow queries (≥ ${fmtMs(slowMs)})`, values: series(calls.filter((c) => c.durationMs >= slowMs), (c) => c.startMs, w.window, CHART_BUCKETS) }
      : { label: "Avg query duration", values: series(calls, (c) => c.startMs, w.window, CHART_BUCKETS, "avg", (c) => c.durationMs) };
  const action = <Select small label="Chart metric" value={metric} onChange={setMetric} options={[["slow", "Slow queries"], ["avg", "Avg duration"]]} />;
  return (
    <Panel title={metric === "slow" ? "Slow Queries Over Time" : "Query Duration Over Time"} action={action}>
      {calls.length === 0 ? (
        <Empty title="No queries in this time range">Database calls show up here once your services run queries.</Empty>
      ) : (
        <TimeChart
          starts={starts}
          lines={[{ ...line, color: "var(--wl-blue)" }]}
          bars={[{ label: "Total queries", values: total, color: "var(--wl-chart-bar)" }]}
          format={metric === "avg" ? (v) => fmtMs(v) : undefined}
          separateBarScale
        />
      )}
    </Panel>
  );
}

type OpStat = "avg" | "total" | "count";

const OP_FORMAT: Record<OpStat, (v: number) => string> = {
  avg: (v) => fmtMs(v),
  total: (v) => fmtMs(v),
  count: (v) => v.toLocaleString("en-US"),
};

export function OperationsPanel({ stats }: { stats: DatabaseStats }) {
  const [stat, setStat] = useState<OpStat>("avg");
  const items = stats.operations.map((o) => {
    const value = stat === "avg" ? (o.avgMs ?? 0) : stat === "total" ? o.totalMs : o.count;
    return { key: o.operation, label: o.operation, value, display: o.count === 0 ? "–" : OP_FORMAT[stat](value) };
  });
  const top = Math.max(0, ...items.map((i) => i.value));
  for (const i of items) Object.assign(i, { color: i.value === top ? "var(--wl-blue)" : "color-mix(in srgb, var(--wl-blue) 55%, transparent)" });
  const action = <Select small label="Breakdown metric" value={stat} onChange={setStat} options={[["avg", "Avg duration"], ["total", "Total time"], ["count", "Count"]]} />;
  return (
    <Panel title="Query Duration Breakdown" action={action}>
      <BarList items={items} />
    </Panel>
  );
}
