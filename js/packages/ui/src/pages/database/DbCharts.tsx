import { useState } from "react";
import type { DatabaseModel } from "@wizeworks/lens-core/internal";
import { fmtMs } from "../../format";
import { setQuery } from "../../routes";
import { BarList } from "../../ui/BarList";
import { Select } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { TimeChart } from "../../ui/TimeChart";

type Metric = "slow" | "avg";

export function SlowQueriesPanel({ stats }: { stats: DatabaseModel }) {
  const [metric, setMetric] = useState<Metric>("slow");
  const { chart, starts, slowMs } = stats;
  const total = chart.total;
  const line = metric === "slow" ? { label: `Slow queries (≥ ${fmtMs(slowMs)})`, values: chart.slow } : { label: "Avg query duration", values: chart.avg };
  const action = <Select small label="Chart metric" value={metric} onChange={setMetric} options={[["slow", "Slow queries"], ["avg", "Avg duration"]]} />;
  return (
    <Panel title={metric === "slow" ? "Slow Queries Over Time" : "Query Duration Over Time"} action={action}>
      {stats.summary.queries === 0 ? (
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

export function OperationsPanel({ stats }: { stats: DatabaseModel }) {
  const [stat, setStat] = useState<OpStat>("avg");
  const items = stats.operations.map((o) => {
    const value = stat === "avg" ? (o.avgMs ?? 0) : stat === "total" ? o.totalMs : o.count;
    const pick = () => setQuery({ operation: o.operation === stats.filter.operation ? null : o.operation, page: null });
    return { key: o.operation, label: o.operation, value, display: o.count === 0 ? "–" : OP_FORMAT[stat](value), onClick: pick };
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
