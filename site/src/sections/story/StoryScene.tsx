"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import { EDGES, NODES, PLATFORM, STOPS, type Box, type SceneNode } from "./scene";

type P = MotionValue<number>;

function useTrack(p: P, a: number, b: number, d: number) {
  return useTransform(p, STOPS, [a, a, b, b, d, d]);
}

function useBox(p: P, n: SceneNode) {
  return {
    x: useTrack(p, n.A.x, n.B.x, n.D.x),
    y: useTrack(p, n.A.y, n.B.y, n.D.y),
    w: useTrack(p, n.A.w, n.B.w, n.D.w),
    h: useTrack(p, n.A.h, n.B.h, n.D.h),
  };
}

function Node({ n, p }: { n: SceneNode; p: P }) {
  const b = useBox(p, n);
  const shown = useTransform(p, STOPS, [n.showA ? 1 : 0, n.showA ? 1 : 0, 1, 1, 1, 1]);
  const fill = useTransform(p, [0.66, 0.8], ["#282828", n.color]);
  const rx = useTrack(p, 14, 12, 5);
  const labelX = useTransform(p, [0.66, 0.8], [1, 0]);
  const tx = useTransform(() => labelX.get() * (b.x.get() + 14) + (1 - labelX.get()) * 20);
  const ty = useTransform(() => b.y.get() + b.h.get() / 2 + 5);
  const thenOpacity = useTransform(p, [0.18, 0.24], [1, 0]);
  const nowOpacity = useTransform(p, [0.2, 0.28], [n.then ? 0 : 1, 1]);
  return (
    <motion.g style={{ opacity: shown }}>
      <motion.rect x={b.x} y={b.y} width={b.w} height={b.h} rx={rx} style={{ fill }} className="wl-sc-box" />
      {n.then && <motion.text x={tx} y={ty} className="wl-sc-label" style={{ opacity: thenOpacity }}>{n.then}</motion.text>}
      <motion.text x={tx} y={ty} className="wl-sc-label" style={{ opacity: nowOpacity }}>{n.label}</motion.text>
    </motion.g>
  );
}

function center(id: string, phase: "B"): [number, number] {
  const box: Box = NODES.find((n) => n.id === id)![phase];
  return [box.x + box.w / 2, box.y + box.h / 2];
}

function Wires({ p }: { p: P }) {
  const opacity = useTransform(p, STOPS, [0, 0, 1, 1, 0, 0]);
  return (
    <motion.g style={{ opacity }}>
      {EDGES.map(([a, b]) => {
        const [x1, y1] = center(a, "B");
        const [x2, y2] = center(b, "B");
        return <line key={`${a}-${b}`} x1={x1} y1={y1} x2={x2} y2={y2} className="wl-sc-wire" />;
      })}
    </motion.g>
  );
}

function Platform({ p }: { p: P }) {
  const opacity = useTransform(p, [0.4, 0.48, 0.62, 0.68], [0, 1, 1, 0]);
  return (
    <motion.g style={{ opacity }}>
      <rect x={PLATFORM.x} y={PLATFORM.y} width={PLATFORM.w} height={PLATFORM.h} rx="12" className="wl-sc-platform" />
      <text x={PLATFORM.x + 16} y={PLATFORM.y + 30} className="wl-sc-label wl-sc-dim">a platform, far away</text>
      {NODES.filter((n) => n.id !== "web").map((n) => (
        <line key={n.id} x1={n.B.x + n.B.w / 2} y1={n.B.y} x2={PLATFORM.x + PLATFORM.w / 2} y2={PLATFORM.y + PLATFORM.h} className="wl-sc-far" />
      ))}
    </motion.g>
  );
}

function OldBar({ p }: { p: P }) {
  const opacity = useTransform(p, [0, 0.16, 0.22], [1, 1, 0]);
  return (
    <motion.g style={{ opacity }}>
      <rect x="30" y="244" width="150" height="26" rx="0" className="wl-sc-bar" />
      <text x="42" y="261" className="wl-sc-bartext">42 ms · 3 queries</text>
    </motion.g>
  );
}

function Axis({ p }: { p: P }) {
  const opacity = useTransform(p, [0.76, 0.84], [0, 1]);
  return (
    <motion.g style={{ opacity }}>
      <text x="20" y="44" className="wl-sc-label">GET /api/checkout · 305 ms · one trace</text>
      <line x1="150" y1="56" x2="571" y2="56" className="wl-sc-axis" />
    </motion.g>
  );
}

// The story drawn as one scene that changes shape as you scroll.
export function StoryScene({ progress }: { progress: P }) {
  return (
    <svg viewBox="0 0 600 360" className="wl-sc" role="img" aria-label="One app splits into many services, then folds back into one timeline.">
      <Platform p={progress} />
      <Wires p={progress} />
      <Axis p={progress} />
      {NODES.map((n) => <Node key={n.id} n={n} p={progress} />)}
      <OldBar p={progress} />
    </svg>
  );
}
