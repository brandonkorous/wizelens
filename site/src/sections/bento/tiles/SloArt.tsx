"use client";

import { motion } from "motion/react";
import { Num } from "@/components/ui/Num";

const W = 200;
const H = 48;

// The budget left over 30 days: flat, a bad day, then a slow burn.
const BUDGET = [100, 100, 99, 99, 98, 98, 97, 97, 96, 96, 95, 95, 82, 80, 79, 78, 77, 76, 75, 74, 73, 72, 71, 70, 69, 68, 67, 65, 64, 62];

const PATH = BUDGET.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (BUDGET.length - 1)) * W).toFixed(1)} ${(H - 4 - (v / 100) * (H - 8)).toFixed(1)}`).join("");

const BURN = [
  { label: "Burn, last hour", value: "0.8×" },
  { label: "Burn, 6 hours", value: "1.4×" },
  { label: "Apdex", value: "0.94" },
];

/** An SLO page: the error budget left, how fast it burns, and Apdex. */
export function SloArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-sl">
      <div className="wl-sl-head">
        <b>Checkout succeeds</b>
        <span className="wl-muted">99.9% over 30 days</span>
      </div>
      <div className="wl-sl-budget">
        <span className="wl-num"><Num value={seen ? 62 : 100} decimals={0} duration={1.6} suffix="%" /></span>
        <span className="wl-muted">error budget left</span>
      </div>
      <span className="wl-sl-track">
        <motion.i initial={{ width: "100%" }} animate={{ width: seen ? "62%" : "100%" }} transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }} />
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <motion.path d={PATH} fill="none" stroke="var(--wl-blue)" strokeWidth="2" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: 1.6, ease: "easeInOut" }} />
      </svg>
      <div className="wl-sl-burn">
        {BURN.map((b) => (
          <span key={b.label}><b className="wl-num">{b.value}</b>{b.label}</span>
        ))}
      </div>
    </div>
  );
}
