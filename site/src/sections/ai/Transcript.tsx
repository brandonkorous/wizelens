"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { CheckIcon, PlayIcon } from "@/components/ui/icons";
import { BEATS, type Beat } from "./script";

const EASE = [0.22, 1, 0.36, 1] as const;
const GAPS = [900, 1100, 900, 1300, 900, 1100, 1300, 900];

function useScript(start: boolean) {
  const [shown, setShown] = useState(-1);
  const [run, setRun] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!start) return;
    if (reduced) { setShown(BEATS.length); return; }
    setShown(-1);
    const timers: number[] = [];
    let at = 400;
    for (let i = 0; i <= BEATS.length; i++) {
      at += GAPS[i] ?? 900;
      timers.push(window.setTimeout(() => setShown(i), at));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [start, run, reduced]);
  return { shown, replay: () => setRun((r) => r + 1) };
}

function BeatView({ beat, settled }: { beat: Beat; settled: boolean }) {
  switch (beat.kind) {
    case "ask":
      return <div className="wl-tr-ask">{beat.text}</div>;
    case "call":
      return (
        <div className="wl-tr-call">
          <span className={`wl-tr-state${settled ? " wl-tr-ok" : ""}`}>{settled ? <CheckIcon /> : <i />}</span>
          <code><b>{beat.tool}</b> {beat.args}</code>
        </div>
      );
    case "result":
      return <pre className="wl-tr-result">{beat.lines.map((l) => <span key={l} className={l.includes("[redacted]") ? "wl-tr-red" : undefined}>{l}{"\n"}</span>)}</pre>;
    case "answer":
      return <div className="wl-tr-answer">{beat.text}</div>;
    case "audit":
      return <code className="wl-tr-audit">{beat.text}</code>;
  }
}

// A scripted agent session: the switch goes on, the agent asks, WizeLens answers read-only.
export function Transcript() {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.4, once: true });
  const { shown, replay } = useScript(inView);
  const on = shown >= 0;

  return (
    <div className="wl-tr" ref={box}>
      <div className="wl-tr-config">
        <code>builder.Services.AddWizeLens(o =&gt; o.Mcp = <b className={on ? "wl-tr-true" : "wl-tr-false"}>{on ? "true" : "false"}</b>);</code>
        <span className={`wl-switch${on ? " wl-switch-on" : ""}`} aria-hidden><i /></span>
      </div>
      <div className="wl-tr-body">
        <AnimatePresence initial={false}>
          {BEATS.map((b, i) => i < shown ? (
            <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}>
              <BeatView beat={b} settled={i < shown - 1} />
            </motion.div>
          ) : null)}
        </AnimatePresence>
      </div>
      <button type="button" className="wl-q-replay wl-tr-replay" onClick={replay} disabled={shown < BEATS.length}>
        <PlayIcon /> Replay
      </button>
    </div>
  );
}
