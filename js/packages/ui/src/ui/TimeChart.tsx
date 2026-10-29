import { type MouseEvent, type RefObject, useEffect, useRef, useState } from "react";
import type { Release } from "@wizeworks/lens-core";
import { fmtBucket, fmtTick } from "../format";
import { setWindowPref } from "../data/period";
import { useReleases } from "../data/releases";
import { areaPath, linePath, maxOf, niceMax, ticksOf } from "./chartMath";
import { type ChartOutage, OutageBands } from "./OutageBands";
import { releaseIndex, ReleaseMarks } from "./ReleaseMarks";
import { ChartLegend } from "./ChartLegend";

const spanOf = (starts: readonly number[]) => (starts.length > 1 ? starts[starts.length - 1]! - starts[0]! : 0);

export interface ChartSeries {
  label: string;
  values: (number | null)[];
  /** CSS color, for example "var(--wl-blue)". */
  color: string;
  /** A faint dashed line, for the period a chart compares with. */
  dashed?: boolean;
}

export interface TimeChartProps {
  /** Start time of every bucket. */
  starts: number[];
  lines?: ChartSeries[];
  bars?: ChartSeries[];
  height?: number;
  /** Format for the axis and the tooltip. */
  format?: (v: number) => string;
  /** A shorter format for the value axis only, when the unit is said once beside the chart. */
  axisFormat?: (v: number) => string;
  /** Bars use their own scale, so a few big counts don't flatten the line. */
  separateBarScale?: boolean;
  /** Bars sit on top of each other instead of side by side. */
  stackBars?: boolean;
  /** Drag across the chart to show that span (a custom time range). On unless false. */
  zoom?: boolean;
  /** Release markers (versions that first sent data in the window). On unless false. */
  releases?: boolean;
  /** Fill under every line, not only the first. */
  areas?: boolean;
  /** Times something was down, drawn as red bands. */
  outages?: readonly ChartOutage[];
}

const PAD = { left: 44, right: 8, top: 10, bottom: 26 };

function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

interface Frame {
  x: (i: number) => number;
  y: (v: number) => number;
  yBar: (v: number) => number;
  max: number;
  slot: number;
  base: number;
  /** Room left of the plot for the value labels: the longest label, about 7 px a letter at 12 px, at most 40% of the chart. */
  left: number;
}

const fmtOf = (p: TimeChartProps) => p.axisFormat ?? p.format ?? ((v: number) => String(Math.round(v)));
const ticksFor = (max: number) => ticksOf(max, max <= 4 && Number.isInteger(max) ? max : undefined);

function frameOf(p: TimeChartProps, width: number, height: number): Frame {
  const n = Math.max(1, p.starts.length);
  const lineMax = niceMax(maxOf((p.lines ?? []).map((s) => s.values)));
  const barMax = niceMax(maxOf(p.stackBars ? [stackTotals(p)] : (p.bars ?? []).map((s) => s.values)));
  const max = p.separateBarScale || !p.lines?.length ? (p.lines?.length ? lineMax : barMax) : Math.max(lineMax, barMax);
  const base = height - PAD.bottom;
  const span = base - PAD.top;
  const barScale = p.separateBarScale ? barMax : max;
  const longest = Math.max(0, ...ticksFor(max).map((t) => fmtOf(p)(t).length));
  const left = Math.min(Math.round(width * 0.4), Math.max(PAD.left, longest * 7 + 12));
  const slot = (width - left - PAD.right) / n;
  return { left, x: (i) => left + slot * (i + 0.5), y: (v) => base - (v / max) * span, yBar: (v) => base - (v / barScale) * span * (p.separateBarScale ? 0.85 : 1), max, slot, base };
}

function Axes({ p, f, width }: { p: TimeChartProps; f: Frame; width: number }) {
  const fmt = fmtOf(p);
  // As many time labels as fit (a label like "11:55 PM" needs about 72 px), from 2 up to 6.
  const fit = Math.max(2, Math.min(6, Math.floor((width - f.left - PAD.right) / 72)));
  const every = Math.max(1, Math.ceil(p.starts.length / fit));
  return (
    <g>
      {ticksFor(f.max).map((t) => (
        <g key={t}>
          <line className="wl-chart-grid" x1={f.left} x2={width - PAD.right} y1={f.y(t)} y2={f.y(t)} />
          <text className="wl-chart-axis" x={f.left - 8} y={f.y(t) + 4} textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
      {p.starts.map((s, i) => i % every === 0 && (
        <text key={s} className="wl-chart-axis" x={f.x(i)} y={f.base + 18} textAnchor="middle">{fmtTick(s, spanOf(p.starts))}</text>
      ))}
    </g>
  );
}

const stackTotals = (p: TimeChartProps): number[] => p.starts.map((_, i) => (p.bars ?? []).reduce((t, s) => t + (s.values[i] ?? 0), 0));

function StackedBars({ p, f }: { p: TimeChartProps; f: Frame }) {
  const bw = Math.max(1, f.slot * 0.62);
  const below = new Array<number>(p.starts.length).fill(0);
  return (
    <g>
      {(p.bars ?? []).map((s, si) => s.values.map((v, i) => {
        if (!v) return null;
        const bottom = below[i]!;
        below[i] = bottom + v;
        return <rect key={`${si}-${i}`} x={f.x(i) - bw / 2} y={f.yBar(bottom + v)} width={bw - 0.5} height={f.yBar(bottom) - f.yBar(bottom + v)} fill={s.color} />;
      }))}
    </g>
  );
}

function SideBars({ p, f }: { p: TimeChartProps; f: Frame }) {
  const bars = p.bars ?? [];
  const bw = Math.max(1, (f.slot * 0.62) / Math.max(1, bars.length));
  return (
    <g>
      {bars.map((s, si) => s.values.map((v, i) => v ? (
        <rect key={`${si}-${i}`} x={f.x(i) - (bw * bars.length) / 2 + si * bw} y={f.yBar(v)} width={bw - 0.5} height={f.base - f.yBar(v)} rx="1.5" fill={s.color} />
      ) : null))}
    </g>
  );
}

function Plot({ p, f }: { p: TimeChartProps; f: Frame }) {
  return (
    <g>
      {p.stackBars ? <StackedBars p={p} f={f} /> : <SideBars p={p} f={f} />}
      {(p.lines ?? []).map((s, si) => (
        <g key={s.label}>
          {(si === 0 || p.areas) && !s.dashed && <path d={areaPath(s.values, f.x, f.y, f.base)} fill={s.color} opacity={p.areas ? 0.18 : 0.08} />}
          <path d={linePath(s.values, f.x, f.y)} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.5 : 2} strokeLinejoin="round" strokeDasharray={s.dashed ? "4 4" : undefined} opacity={s.dashed ? 0.7 : 1} />
        </g>
      ))}
    </g>
  );
}

function Tip({ p, i, left, releases }: { p: TimeChartProps; i: number; left: number; releases: readonly Release[] }) {
  const fmt = p.format ?? ((v: number) => String(Math.round(v)));
  const all = [...(p.lines ?? []), ...(p.bars ?? [])];
  const here = releases.filter((r) => Math.floor(releaseIndex(p.starts, r.firstMs) ?? -1) === i);
  return (
    <div className="wl-chart-tip" style={{ left, top: 0 }}>
      <strong>{fmtBucket(p.starts[i]!, spanOf(p.starts))}</strong>
      {all.map((s) => (
        <div key={s.label}>
          <span>{s.label}</span>
          <b>{s.values[i] == null ? "–" : fmt(s.values[i]!)}</b>
        </div>
      ))}
      {here.map((r) => (
        <div key={`${r.service}|${r.version}`} className="wl-chart-tip-release">
          <span>{r.service}</span>
          <b>{r.version} released</b>
        </div>
      ))}
    </div>
  );
}

/** Drag across buckets to pick a span; letting go shows it as a custom range. */
function useZoom(p: TimeChartProps, f: Frame) {
  const [drag, setDragState] = useState<{ a: number; b: number } | null>(null);
  // Mouse events can outrun renders, so the latest drag lives in a ref too.
  const latest = useRef<{ a: number; b: number } | null>(null);
  const setDrag = (d: { a: number; b: number } | null) => setDragState((latest.current = d));
  const on = p.zoom !== false && p.starts.length > 1;
  const finish = () => {
    const d = latest.current;
    if (d && d.a !== d.b) {
      const size = p.starts[1]! - p.starts[0]!;
      setWindowPref({ from: p.starts[Math.min(d.a, d.b)]!, to: p.starts[Math.max(d.a, d.b)]! + size });
    }
    setDrag(null);
  };
  const band = drag && drag.a !== drag.b ? { x: f.x(Math.min(drag.a, drag.b)) - f.slot / 2, w: (Math.abs(drag.a - drag.b) + 1) * f.slot } : null;
  return { on, latest, setDrag, finish, band };
}

export function TimeChart(props: TimeChartProps) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const height = props.height ?? 200;
  const f = frameOf(props, width, height);
  const zoom = useZoom(props, f);
  const all = useReleases();
  const releases = props.releases === false ? [] : all;
  const indexAt = (e: MouseEvent<SVGSVGElement>) => Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - f.left) / f.slot);
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const i = indexAt(e);
    const inside = i >= 0 && i < props.starts.length;
    setHover(inside ? i : null);
    if (inside && zoom.latest.current) zoom.setDrag({ ...zoom.latest.current, b: i });
  };
  const onDown = (e: MouseEvent<SVGSVGElement>) => {
    const i = indexAt(e);
    if (zoom.on && i >= 0 && i < props.starts.length) zoom.setDrag({ a: i, b: i });
  };
  const series = [...(props.lines ?? []), ...(props.bars ?? [])];
  return (
    <div className="wl-chart" ref={ref}>
      <svg width={width} height={height} className={zoom.on ? "wl-chart-zoom" : undefined} onMouseMove={onMove} onMouseDown={onDown} onMouseUp={zoom.finish} onMouseLeave={() => (setHover(null), zoom.setDrag(null))} role="img" aria-label={series.map((s) => s.label).join(", ")}>
        <Axes p={props} f={f} width={width} />
        <OutageBands outages={props.outages ?? []} starts={props.starts} at={(i) => f.left + f.slot * i} top={PAD.top} base={f.base} />
        <Plot p={props} f={f} />
        <ReleaseMarks releases={releases} starts={props.starts} at={(i) => f.left + f.slot * i} top={PAD.top} base={f.base} />
        {zoom.band && <rect className="wl-chart-band" x={zoom.band.x} y={PAD.top} width={zoom.band.w} height={f.base - PAD.top} />}
        {hover !== null && <line x1={f.x(hover)} x2={f.x(hover)} y1={PAD.top} y2={f.base} stroke="var(--wl-line-strong)" />}
      </svg>
      {hover !== null && <Tip p={props} i={hover} left={Math.min(f.x(hover) + 12, width - 160)} releases={releases} />}
      <ChartLegend series={series} />
    </div>
  );
}
