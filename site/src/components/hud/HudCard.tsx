"use client";

import { motion } from "motion/react";
import { Num } from "@/components/ui/Num";
import { HEALTH_COLOR } from "@/lib/health";
import type { HudSample } from "./samples";

const EASE = [0.22, 1, 0.36, 1] as const;

function codeTone(code: number): string {
  if (code >= 500) return "wl-hud-code-err";
  if (code >= 400) return "wl-hud-code-warn";
  return "wl-hud-code-ok";
}

function SplitBar({ s }: { s: HudSample }) {
  const sum = s.server + s.db + s.render || 1;
  const parts = [
    { key: "server", w: (s.server / sum) * 100, c: "var(--wl-k-server)" },
    { key: "db", w: (s.db / sum) * 100, c: "var(--wl-k-db)" },
    { key: "render", w: (s.render / sum) * 100, c: "var(--wl-k-render)" },
  ];
  return (
    <div className="wl-hud-split" aria-hidden>
      {parts.map((p) => (
        <motion.span key={p.key} style={{ background: p.c }} animate={{ width: `${p.w}%` }} transition={{ duration: 0.8, ease: EASE }} />
      ))}
    </div>
  );
}

// The small card that sits in the corner of every page, as the add-on draws it.
export function HudCard({ sample }: { sample: HudSample }) {
  const stats = [
    { label: "Total", v: sample.total, warn: false },
    { label: "Server", v: sample.server, warn: false },
    { label: "Database", v: sample.db, warn: sample.db > 200 || sample.health === "opportunity" },
    { label: "Render", v: sample.render, warn: false },
  ];
  return (
    <div className="wl-hud-card">
      <div className="wl-hud-top">
        <span className="wl-dot wl-hud-dot" style={{ background: HEALTH_COLOR[sample.health] }} />
        <strong>WizeLens</strong>
        <span className="wl-hud-path">{sample.method} {sample.path}</span>
        <span className={`wl-hud-code ${codeTone(sample.code)}`}>{sample.code}</span>
      </div>
      <div className="wl-hud-stats">
        {stats.map((st) => (
          <div key={st.label}>
            <b className={st.warn ? "wl-hud-amber" : undefined}><Num value={st.v} suffix=" ms" /></b>
            <span>{st.label}</span>
          </div>
        ))}
      </div>
      <SplitBar s={sample} />
      <div className="wl-hud-foot">
        <span><Num value={sample.sql} decimals={0} /> SQL</span>
        <span><Num value={sample.fetch} decimals={0} /> Fetch</span>
        <span>
          <Num value={sample.insights.length} decimals={0} /> Insights
          {sample.insights.length > 0 && <i className="wl-dot" style={{ background: HEALTH_COLOR[sample.health] }} />}
        </span>
      </div>
    </div>
  );
}
