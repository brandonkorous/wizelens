"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import { EDGES, NODES, STEPS, type MapEdge, type MapNode } from "./steps";

const W = 140;
const H = 64;
const N = STEPS.length;

function node(id: string): MapNode {
  return NODES.find((n) => n.id === id)!;
}

function ends(e: MapEdge): [number, number, number, number] {
  const a = node(e.from);
  const b = node(e.to);
  if (a.y === b.y) return [a.x + W, a.y + H / 2, b.x, b.y + H / 2];
  return [a.x + W / 2, a.y + H, b.x + W / 2, b.y];
}

function Edge({ e, progress }: { e: MapEdge; progress: MotionValue<number> }) {
  const [x1, y1, x2, y2] = ends(e);
  const t = useTransform(progress, [e.step / N, (e.step + 0.6) / N], [0, 1]);
  const cx = useTransform(t, (v) => x1 + (x2 - x1) * v);
  const cy = useTransform(t, (v) => y1 + (y2 - y1) * v);
  const pulse = useTransform(t, [0, 0.04, 0.92, 1], [0, 1, 1, 0]);
  const flat = y1 === y2;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="wl-map-rail" />
      <motion.line x1={x1} y1={y1} x2={x2} y2={y2} className="wl-map-wire" style={{ pathLength: t }} />
      <motion.circle r="5" className="wl-map-pulse" style={{ cx, cy, opacity: pulse }} />
      <motion.text
        x={flat ? (x1 + x2) / 2 : x1 + 10}
        y={flat ? y1 - 10 : (y1 + y2) / 2 + 4}
        textAnchor={flat ? "middle" : "start"}
        className="wl-map-edge-label"
        style={{ opacity: t }}
      >
        {e.label}
      </motion.text>
    </g>
  );
}

function Node({ n, lit }: { n: MapNode; lit: boolean }) {
  const db = n.id.startsWith("db");
  return (
    <g className={`wl-map-node${lit ? " wl-map-lit" : ""}${db ? " wl-map-db" : ""}`} transform={`translate(${n.x} ${n.y})`}>
      <rect width={W} height={H} rx={db ? 32 : 14} />
      <circle cx={W - 16} cy={16} r="4.5" className="wl-map-status" />
      <text x={db ? 28 : 16} y={28} className="wl-map-label">{n.label}</text>
      <text x={db ? 28 : 16} y={47} className="wl-map-sub">{n.sub}</text>
    </g>
  );
}

// The services one click touches, wired up as you scroll.
export function JourneyMap({ progress, active }: { progress: MotionValue<number>; active: number }) {
  return (
    <svg viewBox="0 0 640 280" className="wl-map" role="img" aria-label="A click goes from the React app to gateway-api, then orders-api, and each service queries its database.">
      {EDGES.map((e) => <Edge key={`${e.from}-${e.to}`} e={e} progress={progress} />)}
      {NODES.map((n) => <Node key={n.id} n={n} lit={active >= n.step} />)}
    </svg>
  );
}
