"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { PlayIcon } from "@/components/ui/icons";

const ROW_H = 40;
const IDS = [1042, 1043, 1047, 1051, 1052, 1060, 1061, 1066];
const TIMES = ["0.4", "0.3", "0.3", "0.4", "0.3", "0.3", "0.4", "0.5"];
const EASE = [0.22, 1, 0.36, 1] as const;

type Phase = "idle" | "stream" | "mark" | "fold";

function usePhases(start: boolean) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState(0);
  const [run, setRun] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!start) return;
    if (reduced) { setShown(IDS.length); setPhase("fold"); return; }
    const timers: number[] = [];
    setPhase("stream");
    setShown(0);
    IDS.forEach((_, i) => timers.push(window.setTimeout(() => setShown(i + 1), 250 + i * 170)));
    timers.push(window.setTimeout(() => setPhase("mark"), 250 + IDS.length * 170 + 400));
    timers.push(window.setTimeout(() => setPhase("fold"), 250 + IDS.length * 170 + 1500));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [start, run, reduced]);

  return { phase, shown, replay: () => setRun((r) => r + 1) };
}

function QueryLine({ i, phase }: { i: number; phase: Phase }) {
  const fold = phase === "fold";
  return (
    <motion.div
      className={`wl-q-line${phase !== "stream" ? " wl-q-marked" : ""}`}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: fold && i > 2 ? 0 : 1, x: 0, y: fold ? -i * ROW_H + Math.min(i, 2) * 6 : 0, scale: fold ? 1 - Math.min(i, 2) * 0.03 : 1 }}
      transition={{ duration: fold ? 0.7 : 0.4, ease: EASE, delay: fold ? (IDS.length - i) * 0.03 : 0 }}
      style={{ zIndex: IDS.length - i }}
    >
      <span className="wl-q-sql">
        <b>SELECT</b> id, product, amount <b>FROM</b> orders <b>WHERE</b> customer_id = <em>{IDS[i]}</em>
      </span>
      <span className="wl-q-ms">{TIMES[i]} ms</span>
    </motion.div>
  );
}

function InsightCard() {
  return (
    <motion.div className="wl-q-card" initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, delay: 0.35, ease: EASE }}>
      <div className="wl-q-card-head">
        <span className="wl-q-tag">N+1 query</span>
        <strong>Ran 8 times in one request</strong>
        <span className="wl-q-card-ms">2.9 ms</span>
      </div>
      <p>The orders for each customer are loaded one at a time. Load them for all customers with one query.</p>
      <code>WHERE customer_id IN (@ids)</code>
    </motion.div>
  );
}

// Eight copies of the same query arrive, get flagged, and fold into one insight.
export function QueryFold() {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.5, once: true });
  const { phase, shown, replay } = usePhases(inView);

  return (
    <div className="wl-q" ref={box}>
      <div className="wl-q-head">
        <span>orders-api · GET /orders</span>
        <AnimatePresence>
          {phase !== "idle" && phase !== "stream" && (
            <motion.span className="wl-q-count" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              same statement × 8
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="wl-q-lines" style={{ height: phase === "fold" ? ROW_H + 18 : IDS.length * ROW_H }}>
        {IDS.slice(0, shown).map((id, i) => <QueryLine key={id} i={i} phase={phase} />)}
      </div>
      <AnimatePresence>{phase === "fold" && <InsightCard />}</AnimatePresence>
      <button type="button" className="wl-q-replay" onClick={replay} disabled={phase !== "fold"}>
        <PlayIcon /> Replay
      </button>
    </div>
  );
}
