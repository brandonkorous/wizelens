"use client";

import { motion } from "motion/react";

const W = 200;
const H = 56;

function series(seed: number, base: number, swing: number): number[] {
  return Array.from({ length: 32 }, (_, i) => base + Math.sin(i * 0.55 + seed) * swing + Math.sin(i * 1.7 + seed * 3) * swing * 0.45);
}

function toPath(values: number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - 4 - ((v - min) / (max - min || 1)) * (H - 8);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");
}

const CHARTS = [
  { name: "CPU", value: "23%", color: "var(--wl-blue)", d: toPath(series(1, 20, 6)) },
  { name: "Memory", value: "184 MB", color: "#0d8f7a", d: toPath(series(2.4, 180, 3)) },
  { name: "GC / min", value: "4", color: "var(--wl-orange)", d: toPath(series(4.1, 4, 2)) },
];

export function MetricsArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-mt">
      {CHARTS.map((c, i) => (
        <div key={c.name} className="wl-mt-chart">
          <div className="wl-mt-label">
            <span>{c.name}</span>
            <b className="wl-num">{c.value}</b>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            <motion.path
              d={c.d}
              fill="none"
              stroke={c.color}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: seen ? 1 : 0 }}
              transition={{ duration: 1.6, delay: i * 0.2, ease: "easeInOut" }}
            />
          </svg>
        </div>
      ))}
    </div>
  );
}
