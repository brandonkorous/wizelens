import type { ReactNode } from "react";
import { type DashPanel, fmtMetric, type MetricDetail } from "@wizeworks/lens-core";
import { useMetricDetails } from "../../data/metricDetails";
import { Empty, Panel } from "../../ui/Panel";
import { Sparkline } from "../../ui/Sparkline";
import { type Column, Table } from "../../ui/Table";
import { type ChartSeries, TimeChart } from "../../ui/TimeChart";
import { formatterOf, LINE_COLORS } from "../metrics/MetricParts";

interface Line {
  label: string;
  values: (number | null)[];
  unit: string;
}

/** Every line of every metric; with several metrics, each line says which metric it is. */
function linesOf(details: readonly (MetricDetail | null)[], names: readonly string[]): Line[] {
  return details.flatMap((d, i) => {
    if (!d) return [];
    return d.lines.map((l) => ({ label: names.length > 1 ? `${d.name}${d.lines.length > 1 ? ` · ${l.label}` : ""}` : l.label || d.name, values: l.values, unit: d.displayUnit }));
  });
}

const lastOf = (v: readonly (number | null)[]) => [...v].reverse().find((x) => x != null) ?? null;

function TableView({ lines }: { lines: Line[] }) {
  const stat = (l: Line, f: (vs: number[]) => number) => {
    const vs = l.values.filter((v): v is number => v != null);
    return vs.length ? fmtMetric(f(vs), l.unit) : "–";
  };
  const columns: Column<Line>[] = [
    { key: "label", header: "Series", className: "wl-wrap", cell: (l) => l.label },
    { key: "last", header: "Now", num: true, cell: (l) => fmtMetric(lastOf(l.values), l.unit) },
    { key: "min", header: "Lowest", num: true, cell: (l) => stat(l, (v) => Math.min(...v)) },
    { key: "max", header: "Highest", num: true, cell: (l) => stat(l, (v) => Math.max(...v)) },
    { key: "avg", header: "Average", num: true, cell: (l) => stat(l, (v) => v.reduce((t, x) => t + x, 0) / v.length) },
  ];
  return <Table columns={columns} rows={lines} rowKey={(l) => l.label} />;
}

function NumberView({ lines }: { lines: Line[] }) {
  return (
    <div className="wl-dash-numbers">
      {lines.slice(0, 4).map((l, i) => (
        <div key={l.label} className="wl-dash-number">
          <span className="wl-muted wl-small wl-truncate">{l.label}</span>
          <strong>{fmtMetric(lastOf(l.values), l.unit)}</strong>
          <Sparkline values={l.values} width={240} height={28} stretch color={LINE_COLORS[i % LINE_COLORS.length]} />
        </div>
      ))}
    </div>
  );
}

function body(p: DashPanel, starts: number[], lines: Line[]): ReactNode {
  if (lines.length === 0) return <Empty>No data for these metrics in this time range.</Empty>;
  if (p.type === "table") return <TableView lines={lines} />;
  if (p.type === "number") return <NumberView lines={lines} />;
  const series: ChartSeries[] = lines.slice(0, 10).map((l, i) => ({ label: l.label, values: l.values, color: LINE_COLORS[i % LINE_COLORS.length]! }));
  const format = formatterOf(lines[0]!.unit);
  if (p.type === "bar") return <TimeChart starts={starts} bars={series} stackBars format={format} height={220} />;
  return <TimeChart starts={starts} lines={series} areas={p.type === "area"} format={format} height={220} />;
}

/** One dashboard chart: its metrics, filtered and split as set, drawn as lines, areas, stacked bars, numbers, or a table. */
export function PanelView({ panel, actions }: { panel: DashPanel; actions?: ReactNode }) {
  const { details, loading, error } = useMetricDetails(panel.metrics, panel.where, panel.group);
  const names = panel.metrics.map((m) => m.name);
  const title = panel.title || names.join(", ");
  const starts = details.find((d) => d)?.buckets ?? [];
  return (
    <Panel title={title} action={actions} className={`wl-dash-panel${panel.width === 2 ? " wl-dash-wide" : ""}`}>
      {panel.where && <p className="wl-muted wl-small">Only {panel.where.replace(/,/g, ", ")}</p>}
      {error ? <Empty title="This chart could not load">{error}</Empty> : loading && details.length === 0 ? <Empty>Loading…</Empty> : body(panel, starts, linesOf(details, names))}
    </Panel>
  );
}
