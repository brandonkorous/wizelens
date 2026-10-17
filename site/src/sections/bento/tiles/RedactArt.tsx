"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

const ROWS = [
  { key: "content-type", value: "application/json", secret: false },
  { key: "authorization", value: "Bearer eyJhbGciOiJIUzI1NiJ9.e30", secret: true },
  { key: "cookie", value: "session=4f9c2a7d1b", secret: true },
  { key: "x-request-id", value: "7c1e-42aa", secret: false },
  { key: "connectionString", value: "Host=db;Password=hunter2", secret: true },
];

const GLYPHS = "abcdef0123456789#%&*";
const REDACTED = "[redacted]";

function scramble(text: string, t: number): string {
  const keep = Math.floor(t * REDACTED.length);
  const len = Math.round(text.length + (REDACTED.length - text.length) * t);
  let out = REDACTED.slice(0, keep);
  for (let i = keep; i < len; i++) out += GLYPHS[(i * 7 + Math.floor(t * 40)) % GLYPHS.length];
  return out;
}

function useProgress(active: boolean): number {
  const [t, setT] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active) return;
    if (reduced) { setT(1); return; }
    const start = performance.now() + 700;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / 1100));
      setT(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced]);
  return t;
}

export function RedactArt({ seen }: { seen: boolean }) {
  const t = useProgress(seen);
  return (
    <div className="wl-rx">
      {ROWS.map((r) => (
        <div key={r.key} className={`wl-rx-row${r.secret && t >= 1 ? " wl-rx-done" : ""}`}>
          <span className="wl-rx-key">{r.key}</span>
          <code className="wl-rx-val">{r.secret ? (t <= 0 ? r.value : scramble(r.value, t)) : r.value}</code>
        </div>
      ))}
    </div>
  );
}
