"use client";

import { motion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function AppArt({ seen }: { seen: boolean }) {
  return (
    <svg viewBox="0 0 240 140" className="wl-grow-svg" aria-hidden>
      <rect x="8" y="30" width="120" height="70" rx="12" className="wl-grow-box" />
      <text x="24" y="60" className="wl-grow-t">orders-api</text>
      <text x="24" y="80" className="wl-grow-s">/_wizelens</text>
      <motion.line x1="128" y1="65" x2="160" y2="65" className="wl-grow-wire" initial={{ pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: 0.6, delay: 0.3 }} />
      <g transform="translate(166 42)">
        <path d="M0 8v30c0 4.4 9.8 8 22 8s22-3.6 22-8V8" className="wl-grow-db" />
        <ellipse cx="22" cy="8" rx="22" ry="8" className="wl-grow-db" />
      </g>
      <text x="188" y="112" textAnchor="middle" className="wl-grow-s">traces.db</text>
    </svg>
  );
}

const SERVICES = [20, 50, 80, 110];

export function HubArt({ seen }: { seen: boolean }) {
  return (
    <svg viewBox="0 0 240 140" className={`wl-grow-svg${seen ? " wl-grow-run" : ""}`} aria-hidden>
      {SERVICES.map((y, i) => (
        <g key={y}>
          <motion.line x1="40" y1={y + 5} x2="150" y2="70" className="wl-grow-flow" initial={{ opacity: 0 }} animate={{ opacity: seen ? 1 : 0 }} transition={{ delay: 0.1 * i }} />
          <motion.circle cx="34" cy={y + 5} r="7" className="wl-grow-dot" initial={{ scale: 0 }} animate={{ scale: seen ? 1 : 0 }} transition={{ delay: 0.1 * i, type: "spring", stiffness: 300, damping: 18 }} />
        </g>
      ))}
      <motion.g initial={{ opacity: 0, x: 10 }} animate={seen ? { opacity: 1, x: 0 } : {}} transition={{ delay: 0.4, ease: EASE }}>
        <rect x="150" y="44" width="76" height="52" rx="12" className="wl-grow-box wl-grow-hub" />
        <text x="188" y="68" textAnchor="middle" className="wl-grow-t">hub</text>
        <text x="188" y="84" textAnchor="middle" className="wl-grow-s">:5960</text>
      </motion.g>
    </svg>
  );
}

const ROLES = [
  { initial: "JM", role: "Owner" },
  { initial: "AM", role: "Admin" },
  { initial: "RK", role: "Member" },
  { initial: "SH", role: "Viewer" },
];

export function CloudArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-grow-cloud" aria-hidden>
      <div className="wl-grow-team">
        {ROLES.map((r, i) => (
          <motion.span key={r.role} title={r.role} initial={{ opacity: 0, y: 8 }} animate={seen ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.08 * i }}>
            <b>{r.initial}</b>
            <i>{r.role}</i>
          </motion.span>
        ))}
      </div>
      <motion.div className="wl-grow-alert" initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={seen ? { opacity: 1, y: 0, scale: 1 } : {}} transition={{ delay: 0.6, duration: 0.6, ease: EASE }}>
        <span className="wl-dot" style={{ background: "var(--wl-red)" }} />
        <div>
          <b>Error rate is 3.4% (above 2%)</b>
          <span>orders-api · production · sent to Slack</span>
        </div>
      </motion.div>
    </div>
  );
}
