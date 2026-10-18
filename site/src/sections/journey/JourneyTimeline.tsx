"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import { LANES, STEPS, TIMELINE_MS, type Lane, type LaneBar } from "./steps";

const N = STEPS.length;

const KIND_COLOR: Record<Lane["kind"], string> = {
  net: "var(--wl-k-net)",
  server: "var(--wl-k-server)",
  db: "var(--wl-k-db)",
  render: "var(--wl-k-render)",
};

function Bar({ bar, index, count, lane, color }: { bar: LaneBar; index: number; count: number; lane: MotionValue<number>; color: string }) {
  const grow = useTransform(lane, (v) => Math.min(1, Math.max(0, v * count - index)));
  return (
    <motion.i
      style={{ left: `${(bar.start / TIMELINE_MS) * 100}%`, width: `${(bar.dur / TIMELINE_MS) * 100}%`, background: color, scaleX: grow, originX: 0 }}
    />
  );
}

function Row({ lane, progress }: { lane: Lane; progress: MotionValue<number> }) {
  const t = useTransform(progress, [lane.step / N, (lane.step + 0.8) / N], [0, 1]);
  const fade = useTransform(t, [0, 0.15], [0.35, 1]);
  return (
    <div className="wl-tl-row">
      <span className="wl-tl-label">{lane.label}</span>
      <motion.span className="wl-tl-track" style={{ opacity: fade }}>
        {lane.bars.map((b, i) => (
          <Bar key={i} bar={b} index={i} count={lane.bars.length} lane={t} color={KIND_COLOR[lane.kind]} />
        ))}
      </motion.span>
    </div>
  );
}

// The trace itself: each lane fills in as its part of the story is told.
export function JourneyTimeline({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="wl-tl" aria-hidden>
      <div className="wl-tl-axis">
        {[0, 100, 200, 300].map((ms) => (
          <span key={ms} style={{ left: `${(ms / TIMELINE_MS) * 100}%` }}>{ms} ms</span>
        ))}
      </div>
      {LANES.map((lane) => <Row key={lane.label} lane={lane} progress={progress} />)}
    </div>
  );
}
