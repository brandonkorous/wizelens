import { useMemo, useState } from "react";
import { type PageView, type PhaseStat, renderPhases, series, type TimeWindow } from "@wizeworks/lens-core";
import { fmtMs } from "../../format";
import { BarList, type BarItem } from "../../ui/BarList";
import { Select } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { TimeChart } from "../../ui/TimeChart";
import { BUCKETS, renderSeries } from "./useRendering";

const STATS: [PhaseStat, string][] = [
  ["avg", "Avg. duration"],
  ["p75", "p75 duration"],
];

/** Layout shift above this score is "poor", so the bar fills at it. */
const CLS_POOR = 0.25;

export function RouteChartPanel({ views, starts, window }: { views: PageView[]; starts: number[]; window: TimeWindow }) {
  const [stat, setStat] = useState<PhaseStat>("avg");
  const render = useMemo(() => renderSeries(views, window, stat), [views, window, stat]);
  const counts = useMemo(() => series(views, (v) => v.startMs, window, BUCKETS), [views, window]);
  const action = <Select small label="Render time statistic" value={stat} options={[["avg", "Avg. render time"], ["p75", "p75 render time"]]} onChange={setStat} />;
  return (
    <Panel title="Route Render Duration" action={action}>
      <TimeChart
        starts={starts}
        lines={[{ label: stat === "avg" ? "Render time (avg)" : "Render time (p75)", values: render, color: "var(--wl-blue)" }]}
        bars={[{ label: "Page views", values: counts, color: "var(--wl-chart-bar)" }]}
        format={fmtMs}
        separateBarScale
        height={210}
      />
    </Panel>
  );
}

export function PhasePanel({ views }: { views: PageView[] }) {
  const [stat, setStat] = useState<PhaseStat>("avg");
  const phases = useMemo(() => renderPhases(views, stat), [views, stat]);
  const ms = phases.filter((p) => p.kind === "ms");
  const cls = phases.find((p) => p.kind === "score");
  const measuredAny = phases.some((p) => p.value !== null);
  const toItem = (p: (typeof phases)[number]): BarItem => ({ key: p.key, label: p.label, value: p.value ?? 0, display: p.value === null ? "–" : fmtMs(p.value) });
  const action = <Select small label="Phase statistic" value={stat} options={STATS} onChange={setStat} />;
  return (
    <Panel title="Render Phase Breakdown" action={action}>
      {!measuredAny ? (
        <Empty title="No phase timings yet">Phases show up after the first page view is reported.</Empty>
      ) : (
        <div className="wl-phases">
          <BarList items={ms.map(toItem)} />
          {cls && (
            <BarList
              max={CLS_POOR}
              items={[{ key: cls.key, label: cls.label, value: Math.min(cls.value ?? 0, CLS_POOR), display: cls.value === null ? "–" : cls.value.toFixed(2), color: (cls.value ?? 0) > 0.1 ? "var(--wl-amber)" : undefined }]}
            />
          )}
          <p className="wl-muted wl-small">Layout shift is a score (CLS), not a time. 0.1 or less is good; the bar is full at 0.25.</p>
        </div>
      )}
    </Panel>
  );
}
