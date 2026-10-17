"use client";

import { motion } from "motion/react";
import { Num } from "@/components/ui/Num";

const COMPONENTS = [
  { name: "ProductCard", renders: 48, ms: 31, hot: true },
  { name: "CartBadge", renders: 6, ms: 2.4 },
  { name: "PriceTag", renders: 4, ms: 1.1 },
];

const VITALS = [
  { name: "LCP", value: "1.2 s" },
  { name: "INP", value: "88 ms" },
  { name: "CLS", value: "0.02" },
];

export function RenderArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-rd">
      <div className="wl-rd-list">
        {COMPONENTS.map((c, i) => (
          <motion.div key={c.name} className={`wl-rd-row${c.hot ? " wl-rd-hot" : ""}`} initial={{ opacity: 0, x: 10 }} animate={seen ? { opacity: 1, x: 0 } : {}} transition={{ delay: i * 0.1 }}>
            <code>&lt;{c.name} /&gt;</code>
            <span className="wl-num">× <Num value={seen ? c.renders : 0} decimals={0} duration={1.4} /></span>
            <span className="wl-muted wl-num">{c.ms} ms</span>
          </motion.div>
        ))}
      </div>
      <div className="wl-rd-vitals">
        {VITALS.map((v, i) => (
          <motion.span key={v.name} initial={{ opacity: 0, y: 8 }} animate={seen ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.5 + i * 0.1 }}>
            <i className="wl-dot" style={{ background: "var(--wl-green)" }} />
            {v.name} <b>{v.value}</b>
          </motion.span>
        ))}
      </div>
    </div>
  );
}
