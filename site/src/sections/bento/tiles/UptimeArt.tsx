"use client";

import { motion } from "motion/react";

type Day = "up" | "down" | "part";

const DAYS = 30;

// One bar per day for 30 days; the bad days are listed by index.
function days(down: number[], part: number[]): Day[] {
  return Array.from({ length: DAYS }, (_, i) => (down.includes(i) ? "down" : part.includes(i) ? "part" : "up"));
}

const CHECKS = [
  { name: "Storefront", target: "GET https://fieldnote.test", uptime: "100%", bars: days([], []) },
  { name: "Orders API", target: "GET /healthz · 200-299", uptime: "99.93%", bars: days([], [21]) },
  { name: "Catalog", target: "GET /api/products · 200", uptime: "99.71%", bars: days([12], [13]) },
];

const COLOR: Record<Day, string> = { up: "var(--wl-green)", part: "var(--wl-amber)", down: "var(--wl-red)" };

/** Uptime checks: a bar per day for 30 days, the uptime, and a certificate warning. */
export function UptimeArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-up">
      {CHECKS.map((c, row) => (
        <div key={c.name} className="wl-up-check">
          <div className="wl-up-head">
            <span className="wl-dot" style={{ background: c.bars[DAYS - 1] === "up" ? "var(--wl-green)" : "var(--wl-amber)" }} />
            <b>{c.name}</b>
            <code>{c.target}</code>
            <span className="wl-num">{c.uptime}</span>
          </div>
          <div className="wl-up-bars">
            {c.bars.map((d, i) => (
              <motion.i
                key={i}
                style={{ background: COLOR[d], originY: 1 }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: seen ? 1 : 0 }}
                transition={{ delay: 0.2 + row * 0.2 + i * 0.015, duration: 0.3 }}
              />
            ))}
          </div>
        </div>
      ))}
      <motion.p className="wl-up-tls" initial={{ opacity: 0 }} animate={seen ? { opacity: 1 } : {}} transition={{ delay: 1.4 }}>
        <span className="wl-dot" style={{ background: "var(--wl-amber)" }} />
        fieldnote.test: the certificate ends in 12 days
      </motion.p>
    </div>
  );
}
