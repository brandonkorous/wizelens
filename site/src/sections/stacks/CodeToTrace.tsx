"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { PlayIcon } from "@/components/ui/icons";
import { tokenize } from "@/sections/install/highlight";
import type { RowKind, Stack, TraceRow } from "./types";

const EASE = [0.22, 1, 0.36, 1] as const;
const TYPE_MS = 110;
const ROW_MS = 700;

const KIND_COLOR: Record<RowKind, string> = {
  server: "var(--wl-k-server)",
  db: "var(--wl-k-db)",
  net: "var(--wl-k-net)",
  render: "var(--wl-k-render)",
  log: "var(--wl-slate)",
  msg: "#8b5cf6",
};

// First the code types in, then the trace builds one row at a time.
function usePlay(lines: number, rows: number, start: boolean) {
  const [typed, setTyped] = useState(0);
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!start) return;
    if (reduced) { setTyped(lines); setStep(rows); return; }
    setTyped(0);
    setStep(0);
    const timers: number[] = [];
    for (let i = 1; i <= lines; i++) timers.push(window.setTimeout(() => setTyped(i), 200 + i * TYPE_MS));
    const t0 = 200 + lines * TYPE_MS + 500;
    for (let i = 1; i <= rows; i++) timers.push(window.setTimeout(() => setStep(i), t0 + (i - 1) * ROW_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [lines, rows, start, run, reduced]);
  return { typed, step, replay: () => setRun((r) => r + 1) };
}

function Row({ row, scale, on, now }: { row: TraceRow; scale: number; on: boolean; now: boolean }) {
  return (
    <div className={`wl-ct-row${on ? " wl-ct-on" : ""}${now ? " wl-ct-row-now" : ""}`}>
      <span className="wl-ct-label" style={{ paddingLeft: row.depth * 12 }}>{row.label}</span>
      <span className="wl-ct-ms">{row.ms}</span>
      <span className="wl-ct-track">
        <motion.i
          style={{ left: `${(row.start / scale) * 100}%`, width: `${(row.dur / scale) * 100}%`, background: KIND_COLOR[row.kind], originX: 0 }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: on ? 1 : 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </span>
    </div>
  );
}

// The stack page's demo: each line of setup code lights up the part of the trace it adds.
export function CodeToTrace({ stack }: { stack: Stack }) {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.45, once: true });
  const { typed, step, replay } = usePlay(stack.code.length, stack.rows.length, inView);
  const done = step >= stack.rows.length;
  const source = step > 0 && !done ? stack.rows[step - 1]!.line : -1;
  return (
    <div className="wl-ct" ref={box}>
      <div className="wl-ct-code">
        <div className="wl-ct-bar"><span>{stack.file}</span></div>
        <pre>
          {stack.code.map((line, i) => (
            <span key={i} className={`wl-ct-line${i < typed ? " wl-ct-typed" : ""}${i === source ? " wl-ct-now" : ""}`}>
              {tokenize(line).map((t, j) => <span key={j} className={`wl-tk-${t.kind}`}>{t.text}</span>)}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>
      <div className="wl-ct-trace">
        <div className="wl-ct-bar">
          <span>{stack.traceTitle}</span>
          <button type="button" className="wl-ct-replay" onClick={replay} disabled={!done}><PlayIcon /> Replay</button>
        </div>
        <div className="wl-ct-rows">
          {stack.rows.map((r, i) => <Row key={r.label} row={r} scale={stack.scale} on={i < step} now={i === step - 1 && !done} />)}
        </div>
      </div>
    </div>
  );
}
