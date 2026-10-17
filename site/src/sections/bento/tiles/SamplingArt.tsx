"use client";

import { motion } from "motion/react";

type Dot = "kept" | "error" | "slow" | "dropped";

const COUNT = 72;

// Stands in for the trace-id hash: the same id always lands on the same side of the rate.
function pick(i: number): Dot {
  if (i % 17 === 5 || i === 58) return "error";
  if (i % 23 === 11) return "slow";
  return ((i * 37 + 11) % 100) < 20 ? "kept" : "dropped";
}

const DOTS = Array.from({ length: COUNT }, (_, i) => pick(i));
const KEPT = DOTS.filter((d) => d !== "dropped").length;

const COLOR: Record<Dot, string> = {
  kept: "#2563eb",
  error: "#e63946",
  slow: "#f4b400",
  dropped: "#d3d8e0",
};

export function SamplingArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-sm">
      <div className="wl-sm-grid">
        {DOTS.map((d, i) => (
          <motion.span
            key={i}
            initial={{ scale: 0, backgroundColor: COLOR.dropped }}
            animate={seen ? { scale: d === "dropped" ? 0.55 : 1, backgroundColor: COLOR[d] } : {}}
            transition={{ delay: 0.012 * i, duration: 0.35, backgroundColor: { delay: 1 + 0.008 * i, duration: 0.4 } }}
          />
        ))}
      </div>
      <div className="wl-sm-legend">
        <span><i style={{ background: "var(--wl-blue)" }} />20% sample</span>
        <span><i style={{ background: "var(--wl-red)" }} />errors</span>
        <span><i style={{ background: "var(--wl-amber)" }} />slow</span>
        <b className="wl-num">{KEPT} of {COUNT} kept</b>
      </div>
    </div>
  );
}
