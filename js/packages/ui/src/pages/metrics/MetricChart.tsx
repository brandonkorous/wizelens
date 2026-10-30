import { fmtMetric, type HistogramStat, type MetricDetail } from "@wizeworks/lens-core/internal";
import { setQuery } from "../../routes";
import { AlertOnThis } from "../../ui/AlertOnThis";
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
/** What a new alert on the chart reads: the average, the rate, or p95. */
const ALERT_STAT = { value: "avg", rate: "rate", percentiles: "p95" } as const;

/** A word unit ("collection/s") makes long axis labels; then the axis shows the number and the unit is said once. */
function axisOf(unit: string): { format: (v: number) => string; unit: string } | null {
  const sample = fmtMetric(1, unit);
  const at = sample.indexOf(" ");
  return at < 0 ? null : { format: (v) => fmtMetric(v, unit).split(" ")[0]!, unit: sample.slice(at + 1) };
}

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
      <AlertOnThis fields={{ metric: "metric", metricName: d.name, metricStat: ALERT_STAT[d.display], metricService: d.services.length === 1 ? d.services[0]! : "", name: `${d.name} is high` }} />
    </div>
  );
}

function Summary({ d }: { d: MetricDetail }) {
  const f = (v: number | null) => fmtMetric(v, d.displayUnit);
  const label = d.percentiles ? ` (${d.stat})` : "";
  // With several lines the numbers cover them all: rates add up, plain values are averaged.
  const many = !d.percentiles && d.lines.length > 1;
  return (
    <>
      {many && <p className="wl-metric-sum">{d.display === "rate" ? `These numbers add up all ${d.lines.length} lines.` : `These numbers are the average of all ${d.lines.length} lines.`}</p>}
      <KeyValues
      rows={[
        [`Now${label}`, f(d.summary.last)],
        [`Lowest${label}`, f(d.summary.min)],
        [`Highest${label}`, f(d.summary.max)],
        [`Average${label}`, f(d.summary.avg)],
        ["Shown as", DISPLAY_NOTE[d.display]],
        // OpenTelemetry writes a plain count's unit in braces ("{collection}"); show the word.
        ["Unit", d.unit.replace(/[{}]/g, "").replace(/_/g, " ") || "none"],
        ["Services", d.services.join(", ")],
      ]}
      />
    </>
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
  const axis = axisOf(d.displayUnit);
  const bars = d.countRate ? [{ label: "Values per second", values: d.countRate, color: "var(--wl-chart-bar)" }] : undefined;
  return (
    <Panel title={<h2 className="wl-metric-title">{d.name}</h2>} action={<Controls d={d} />} className="wl-metric-chart">
      {d.description && <p className="wl-metric-desc">{d.description}</p>}
      {axis && <p className="wl-metric-desc">Values in {axis.unit}</p>}
      <TimeChart starts={d.buckets} lines={seriesOf(d)} bars={bars} separateBarScale format={formatterOf(d.displayUnit)} axisFormat={axis?.format} height={260} />
      {d.hidden > 0 && <p className="wl-metric-desc">{d.hidden} more lines are not shown. Split by another key to see them.</p>}
      <Summary d={d} />
    </Panel>
  );
}
