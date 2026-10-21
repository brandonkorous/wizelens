"use client";

import { AnimatePresence, motion } from "motion/react";
import { HEALTH_COLOR } from "@/lib/health";
import type { HudSample, SpanKind } from "./samples";

const EASE = [0.22, 1, 0.36, 1] as const;

const KIND_COLOR: Record<SpanKind, string> = {
  net: "var(--wl-k-net)",
  server: "var(--wl-k-server)",
  db: "var(--wl-k-db)",
  render: "var(--wl-k-render)",
  error: "var(--wl-red)",
};

function Timeline({ s }: { s: HudSample }) {
  return (
    <div className="wl-hud-tl">
      {s.rows.map((r, i) => (
        <motion.div
          key={`${s.id}-${i}`}
          className="wl-hud-tl-row"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 * i, ease: EASE }}
        >
          <span className="wl-hud-tl-label" style={{ paddingLeft: r.depth * 8 }}>{r.label}</span>
          <span className="wl-hud-tl-ms">{r.ms}</span>
          <span className="wl-hud-tl-track">
            <motion.i
              style={{ left: `${(r.start / s.scale) * 100}%`, background: KIND_COLOR[r.kind], originX: 0 }}
              initial={{ width: 0 }}
              animate={{ width: `${(r.dur / s.scale) * 100}%` }}
              transition={{ duration: 0.6, delay: 0.15 + 0.08 * i, ease: EASE }}
            />
          </span>
        </motion.div>
      ))}
    </div>
  );
}

function Insights({ s }: { s: HudSample }) {
  return (
    <>
      {s.insights.map((ins, i) => (
        <motion.div
          key={`${s.id}-${i}`}
          className="wl-hud-ins"
          style={{ borderLeftColor: HEALTH_COLOR[ins.tone] }}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.5 + 0.12 * i, ease: EASE }}
        >
          <div className="wl-hud-ins-head">
            <span className={`wl-hud-tag wl-hud-tag-${ins.tone}`}>{ins.tag}</span>
            <b>{ins.title}</b>
            <span className="wl-hud-ins-ms">{ins.ms}</span>
          </div>
          <code>{ins.detail}</code>
        </motion.div>
      ))}
    </>
  );
}

// The details panel that opens above the HUD card: split, timeline, and insights.
export function HudPanel({ sample }: { sample: HudSample }) {
  return (
    <div className="wl-hud-panel">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={sample.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="wl-hud-panel-head">
            <b>{sample.method} {sample.path}</b>
          </div>
          <p className="wl-hud-meta">{sample.time} · {sample.total} ms · {sample.service}</p>
          <h4 className="wl-hud-h">Timeline</h4>
          <Timeline s={sample} />
          {sample.insights.length > 0 && <h4 className="wl-hud-h">Insights · {sample.insights.length}</h4>}
          <Insights s={sample} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
