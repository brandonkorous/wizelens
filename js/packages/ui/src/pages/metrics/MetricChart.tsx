import { fmtMetric, type HistogramStat, type MetricDetail } from "@wizeworks/lens-core";
import { setQuery } from "../../routes";
import { Select } from "../../ui/Controls";
import { Empty, KeyValues, Panel } from "../../ui/Panel";
import { type ChartSeries, TimeChart } from "../../ui/TimeChart";
import { formatterOf, LINE_COLORS } from "./MetricParts";

const STATS: [HistogramStat, string][] = [
  ["p50", "p50"],
  ["p95", "p95"],
  ["p99", "p99"],
  ["avg", "Average"],
];

const DISPLAY_NOTE = { value: "Value", rate: "Per second", percentiles: "Distribution" } as const;

/** Lines to draw: one per group, or p50 / p95 / p99 for a histogram that is not split. */
function seriesOf(d: MetricDetail): ChartSeries[] {
  if (d.percentiles && !d.groupBy) {
    return (["p50", "p95", "p99"] as const).map((s, i) => ({ label: s, values: d.percentiles![s], color: LINE_COLORS[i]! }));
  }
  return d.lines.map((l, i) => ({ label: l.label, values: l.values, color: LINE_COLORS[i % LINE_COLORS.length]! }));
}

function Controls({ d }: { d: MetricDetail }) {
  const groups: [string, string][] = [["", "Each series"], ...d.groupKeys.map((k): [string, string] => [k, `By ${k}`])];
  return (
    <div className="wl-metric-controls">
      {d.groupKeys.length > 0 && <Select value={d.groupBy} options={groups} onChange={(g) => setQuery({ group: g || null })} label="Split lines" small />}
      {d.percentiles && d.groupBy && <Select value={d.stat} options={STATS} onChange={(s) => setQuery({ stat: s })} label="Statistic" small />}
    </div>
  );
}

function Summary({ d }: { d: MetricDetail }) {
  const f = (v: number | null) => fmtMetric(v, d.displayUnit);
  const label = d.percentiles ? ` (${d.stat})` : "";
  return (
    <KeyValues
      rows={[
        [`Now${label}`, f(d.summary.last)],
        [`Lowest${label}`, f(d.summary.min)],
        [`Highest${label}`, f(d.summary.max)],
        [`Average${label}`, f(d.summary.avg)],
        ["Shown as", DISPLAY_NOTE[d.display]],
        ["Unit", d.unit || "none"],
        ["Services", d.services.join(", ")],
      ]}
    />
  );
}

/** The chosen metric over the time range. */
export function MetricChart({ detail }: { detail: MetricDetail | null }) {
  if (!detail) {
    return (
      <Panel className="wl-metric-chart">
        <Empty title="Pick a metric">Choose a metric from the list, or a tile above, to see it over time.</Empty>
      </Panel>
    );
  }
  const d = detail;
  const bars = d.countRate ? [{ label: "Values per second", values: d.countRate, color: "var(--wl-chart-bar)" }] : undefined;
  return (
    <Panel title={<h2 className="wl-metric-title">{d.name}</h2>} action={<Controls d={d} />} className="wl-metric-chart">
      {d.description && <p className="wl-metric-desc">{d.description}</p>}
      <TimeChart starts={d.buckets} lines={seriesOf(d)} bars={bars} separateBarScale format={formatterOf(d.displayUnit)} height={260} />
      {d.hidden > 0 && <p className="wl-metric-desc">{d.hidden} more lines are not shown. Split by another key to see them.</p>}
      <Summary d={d} />
    </Panel>
  );
}
