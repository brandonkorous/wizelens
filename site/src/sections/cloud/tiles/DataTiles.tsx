"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Num } from "@/components/ui/Num";

const W = 300;
const H = 90;

function wave(n: number, seed: number, swing: number): string {
  const pts = Array.from({ length: n }, (_, i) => 50 + Math.sin(i * 0.7 + seed) * swing + Math.sin(i * 2.3 + seed * 2) * swing * 0.4);
  return pts.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (n - 1)) * W).toFixed(1)} ${(H - (v / 100) * H).toFixed(1)}`).join("");
}

const RANGES = [
  { label: "24 hours", d: wave(24, 1, 18) },
  { label: "7 days", d: wave(42, 2, 22) },
  { label: "30 days", d: wave(60, 3, 26) },
];

export function HistoryArt({ seen }: { seen: boolean }) {
  const [i, setI] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!seen || reduced) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % RANGES.length), 2400);
    return () => window.clearInterval(id);
  }, [seen, reduced]);
  return (
    <div className="wl-ct-history">
      <div className="wl-ct-ranges">
        {RANGES.map((r, j) => <span key={r.label} className={j === i ? "wl-on" : undefined}>{r.label}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <AnimatePresence mode="wait">
          <motion.path key={i} d={RANGES[i]!.d} fill="none" stroke="var(--wl-blue)" strokeWidth="2" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: seen ? 1 : 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1, ease: "easeInOut" }} />
        </AnimatePresence>
      </svg>
    </div>
  );
}

export function ScaleArt({ seen }: { seen: boolean }) {
  const facts = [
    { v: 42000, before: "", after: "", label: "traces on Postgres" },
    { v: 200, before: "", after: "", label: "traces a second" },
    { v: 60, before: "< ", after: " ms", label: "for every page" },
  ];
  return (
    <div className="wl-ct-scale">
      {facts.map((f) => (
        <div key={f.label}>
          <b>{f.before}<Num value={seen ? f.v : 0} decimals={0} duration={1.6} />{f.after}</b>
          <span className="wl-ct-scale-label">{f.label}</span>
        </div>
      ))}
    </div>
  );
}

export function RetentionArt({ seen }: { seen: boolean }) {
  const at = (30 / 400) * 100;
  return (
    <div className="wl-ct-ret">
      <div className="wl-ct-ret-track">
        <motion.span className="wl-ct-ret-fill" initial={{ width: "100%" }} animate={seen ? { width: `${at}%` } : {}} transition={{ duration: 1.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} />
        <motion.i initial={{ left: "100%" }} animate={seen ? { left: `${at}%` } : {}} transition={{ duration: 1.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} />
      </div>
      <div className="wl-ct-ret-scale"><span>1 day</span><b>30 days by default</b><span>400 days</span></div>
    </div>
  );
}

export function KeysArt() {
  return (
    <div className="wl-ct-keys">
      <div><code>wl_ik_…</code><b>Ingest key</b><span>One project. Apps send data with it.</span></div>
      <div><code>wl_rk_…</code><b>Read key</b><span>Projects you pick. Read-only, for scripts and CI.</span></div>
      <div><code>mcp.wizelens.com</code><b>Connected app</b><span>Claude signs in. Read-only, for the projects you pick.</span></div>
    </div>
  );
}
