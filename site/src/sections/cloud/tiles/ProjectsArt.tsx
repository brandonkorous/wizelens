"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Num } from "@/components/ui/Num";

type Row = { name: string; project: string; req: number };

const ROWS: Row[] = [
  { name: "api", project: "Shop", req: 1240 },
  { name: "api", project: "Admin", req: 860 },
  { name: "checkout-web", project: "Shop", req: 640 },
  { name: "worker", project: "Admin", req: 410 },
];

const VIEWS = [
  { label: "Shop", rows: ROWS.filter((r) => r.project === "Shop"), all: false },
  { label: "All projects", rows: ROWS, all: true },
];

/** The project menu flips between one project and all of them: the two "api" services stay apart, and the total adds up. */
export function ProjectsArt({ seen }: { seen: boolean }) {
  const [i, setI] = useState(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!seen || reduced) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % VIEWS.length), 2600);
    return () => window.clearInterval(id);
  }, [seen, reduced]);
  const view = VIEWS[i]!;
  const total = view.rows.reduce((n, r) => n + r.req, 0);
  return (
    <div className="wl-ct-projects">
      <div className="wl-ct-projects-bar">
        {VIEWS.map((v, j) => <span key={v.label} className={j === i ? "wl-on" : undefined}>{v.label}</span>)}
        <b><Num value={seen ? total : 0} decimals={0} /> requests</b>
      </div>
      <ul>
        <AnimatePresence initial={false}>
          {view.rows.map((r) => (
            <motion.li key={`${r.name}-${r.project}`} layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.35 }}>
              <span>{r.name}{view.all && <i> · {r.project}</i>}</span>
              <b>{r.req.toLocaleString("en-US")}</b>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
