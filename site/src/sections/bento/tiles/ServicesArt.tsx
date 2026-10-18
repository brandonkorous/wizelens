"use client";

import { motion } from "motion/react";

const NODES = [
  { id: "web", x: 30, y: 60, label: "web" },
  { id: "gw", x: 130, y: 60, label: "gateway" },
  { id: "or", x: 230, y: 25, label: "orders" },
  { id: "bi", x: 230, y: 95, label: "billing" },
  { id: "db", x: 320, y: 25, label: "SQL" },
  { id: "st", x: 320, y: 95, label: "partner API" },
];

const EDGES: [string, string][] = [["web", "gw"], ["gw", "or"], ["gw", "bi"], ["or", "db"], ["bi", "st"]];

function at(id: string) {
  return NODES.find((n) => n.id === id)!;
}

export function ServicesArt({ seen }: { seen: boolean }) {
  return (
    <svg viewBox="0 0 360 125" className={`wl-sv${seen ? " wl-sv-run" : ""}`} aria-hidden>
      {EDGES.map(([a, b], i) => {
        const p = at(a);
        const q = at(b);
        return (
          <motion.line
            key={`${a}-${b}`}
            x1={p.x} y1={p.y} x2={q.x} y2={q.y}
            className="wl-sv-edge"
            initial={{ opacity: 0 }}
            animate={{ opacity: seen ? 1 : 0 }}
            transition={{ delay: 0.15 * i }}
          />
        );
      })}
      {NODES.map((n, i) => (
        <motion.g key={n.id} initial={{ scale: 0 }} animate={{ scale: seen ? 1 : 0 }} transition={{ delay: 0.1 * i, type: "spring", stiffness: 260, damping: 18 }} style={{ originX: `${n.x}px`, originY: `${n.y}px` }}>
          <circle cx={n.x} cy={n.y} r="7" className={n.id === "st" ? "wl-sv-ext" : "wl-sv-node"} />
          <text x={n.x} y={n.y + 22} textAnchor="middle" className="wl-sv-label">{n.label}</text>
        </motion.g>
      ))}
    </svg>
  );
}
