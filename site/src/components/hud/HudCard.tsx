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

const plural = (n: number, word: string) => `${word}${n === 1 ? "" : "s"}`;

// Errors win over insights, as the add-on's card shows them: "1 Error" with a red dot, else "3 Insights".
function Issues({ s }: { s: HudSample }) {
  const errors = s.errors > 0;
  const n = errors ? s.errors : s.insights.length;
  const flag = errors || (n > 0 && (s.health === "warning" || s.health === "opportunity"));
  return (
    <span>
      <Num value={n} decimals={0} /> {plural(n, errors ? "Error" : "Insight")}
      {flag && <i className="wl-dot" style={{ background: errors ? "var(--wl-red)" : HEALTH_COLOR[s.health] }} />}
    </span>
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
        <Issues s={sample} />
      </div>
    </div>
  );
}
