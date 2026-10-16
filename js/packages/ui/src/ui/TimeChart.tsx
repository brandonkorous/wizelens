import { type MouseEvent, type RefObject, useEffect, useRef, useState } from "react";
import { fmtBucket, fmtTick } from "../format";
import { areaPath, linePath, maxOf, niceMax, ticksOf } from "./chartMath";

const spanOf = (starts: readonly number[]) => (starts.length > 1 ? starts[starts.length - 1]! - starts[0]! : 0);

export interface ChartSeries {
  label: string;
  values: (number | null)[];
  /** CSS color, for example "var(--wl-blue)". */
  color: string;
}

export interface TimeChartProps {
  /** Start time of every bucket. */
  starts: number[];
  lines?: ChartSeries[];
  bars?: ChartSeries[];
  height?: number;
  /** Format for the axis and the tooltip. */
  format?: (v: number) => string;
  /** Bars use their own scale, so a few big counts don't flatten the line. */
  separateBarScale?: boolean;
  /** Bars sit on top of each other instead of side by side. */
  stackBars?: boolean;
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
}

function frameOf(p: TimeChartProps, width: number, height: number): Frame {
  const n = Math.max(1, p.starts.length);
  const slot = (width - PAD.left - PAD.right) / n;
  const lineMax = niceMax(maxOf((p.lines ?? []).map((s) => s.values)));
  const barMax = niceMax(maxOf(p.stackBars ? [stackTotals(p)] : (p.bars ?? []).map((s) => s.values)));
  const max = p.separateBarScale || !p.lines?.length ? (p.lines?.length ? lineMax : barMax) : Math.max(lineMax, barMax);
  const base = height - PAD.bottom;
  const span = base - PAD.top;
  const barScale = p.separateBarScale ? barMax : max;
  return { x: (i) => PAD.left + slot * (i + 0.5), y: (v) => base - (v / max) * span, yBar: (v) => base - (v / barScale) * span * (p.separateBarScale ? 0.85 : 1), max, slot, base };
}

function Axes({ p, f, width }: { p: TimeChartProps; f: Frame; width: number }) {
  const fmt = p.format ?? ((v: number) => String(Math.round(v)));
  const every = Math.max(1, Math.ceil(p.starts.length / 6));
  return (
    <g>
      {ticksOf(f.max, f.max <= 4 && Number.isInteger(f.max) ? f.max : 4).map((t) => (
        <g key={t}>
          <line className="wl-chart-grid" x1={PAD.left} x2={width - PAD.right} y1={f.y(t)} y2={f.y(t)} />
          <text className="wl-chart-axis" x={PAD.left - 8} y={f.y(t) + 4} textAnchor="end">{fmt(t)}</text>
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
          {si === 0 && <path d={areaPath(s.values, f.x, f.y, f.base)} fill={s.color} opacity="0.08" />}
          <path d={linePath(s.values, f.x, f.y)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
        </g>
      ))}
    </g>
  );
}

function Tip({ p, i, left }: { p: TimeChartProps; i: number; left: number }) {
  const fmt = p.format ?? ((v: number) => String(Math.round(v)));
  const all = [...(p.lines ?? []), ...(p.bars ?? [])];
  return (
    <div className="wl-chart-tip" style={{ left, top: 0 }}>
      <strong>{fmtBucket(p.starts[i]!, spanOf(p.starts))}</strong>
      {all.map((s) => (
        <div key={s.label}>
          <span>{s.label}</span>
          <b>{s.values[i] == null ? "–" : fmt(s.values[i]!)}</b>
        </div>
      ))}
    </div>
  );
}

export function TimeChart(props: TimeChartProps) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const height = props.height ?? 200;
  const f = frameOf(props, width, height);
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - box.left - PAD.left) / f.slot);
    setHover(i >= 0 && i < props.starts.length ? i : null);
  };
  const series = [...(props.lines ?? []), ...(props.bars ?? [])];
  return (
    <div className="wl-chart" ref={ref}>
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={series.map((s) => s.label).join(", ")}>
        <Axes p={props} f={f} width={width} />
        <Plot p={props} f={f} />
        {hover !== null && <line x1={f.x(hover)} x2={f.x(hover)} y1={PAD.top} y2={f.base} stroke="var(--wl-line-strong)" />}
      </svg>
      {hover !== null && <Tip p={props} i={hover} left={Math.min(f.x(hover) + 12, width - 160)} />}
      <div className="wl-chart-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
