import { useId } from "react";
import { areaPath, linePath, maxOf } from "./chartMath";

export interface SparklineProps {
  values: readonly (number | null)[];
  width?: number;
  height?: number;
  /** CSS color, for example "var(--wl-blue)". */
  color?: string;
  /** Fill the width CSS gives it (the stat cards), instead of keeping its shape. */
  stretch?: boolean;
}

/** A tiny trend line with a soft fill, for stat cards and tables. */
export function Sparkline({ values, width = 86, height = 30, color = "var(--wl-blue)", stretch = false }: SparklineProps) {
  const id = useId();
  if (values.length < 2 || values.every((v) => v === null || v === 0)) return <svg className="wl-spark" width={width} height={height} aria-hidden="true" />;
  const max = maxOf([values]) || 1;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 2 - (v / max) * (height - 4);
  return (
    <svg className="wl-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={stretch ? "none" : undefined} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(values, x, y, height)} fill={`url(#${id})`} />
      <path d={linePath(values, x, y)} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
