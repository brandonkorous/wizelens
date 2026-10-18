"use client";

import { motion } from "motion/react";

const FRAMES = [
  "at System.Linq.Enumerable.First[T](IEnumerable`1 source)",
  "at Gateway.BoomController.Get() in BoomController.cs:line 42",
  "at Microsoft.AspNetCore.Mvc.Infrastructure.ActionMethodExecutor",
];

export function ErrorArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-er">
      <div className="wl-er-head">
        <span className="wl-dot" style={{ background: "var(--wl-red)" }} />
        <b>InvalidOperationException</b>
        <span className="wl-er-req">GET /api/boom · 500</span>
      </div>
      <p className="wl-er-msg">Sequence contains no elements</p>
      <div className="wl-er-stack">
        {FRAMES.map((f, i) => (
          <motion.code
            key={f}
            className={i === 1 ? "wl-er-mine" : undefined}
            initial={{ opacity: 0 }}
            animate={seen ? { opacity: 1 } : {}}
            transition={{ delay: 0.2 + i * 0.15 }}
          >
            {f}
          </motion.code>
        ))}
      </div>
    </div>
  );
}
