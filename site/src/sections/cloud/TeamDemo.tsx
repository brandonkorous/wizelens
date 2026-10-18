"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;
const BEATS = [0, 1300, 2700, 4300, 6200, 8600];
const LOOP_MS = 11500;

const PEOPLE = [
  { initials: "JM", name: "Jo M.", role: "Owner", color: "#1f1f1f" },
  { initials: "AM", name: "Ada M.", role: "Admin", color: "#2563eb" },
  { initials: "RK", name: "Ravi K.", role: "Member", color: "#0d8f7a" },
];

const NEW_PERSON = { initials: "SH", name: "Sara H.", role: "Member", color: "#c2347a" };

// Steps through the scene: invite, join, key, alert fired, alert resolved, then starts again.
function useBeat(active: boolean): number {
  const [beat, setBeat] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active) return;
    if (reduced) { setBeat(4); return; }
    const timers: number[] = [];
    const run = () => {
      BEATS.forEach((at, i) => timers.push(window.setTimeout(() => setBeat(i), at)));
      timers.push(window.setTimeout(run, LOOP_MS));
    };
    run();
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [active, reduced]);
  return beat;
}

function Person({ p, fresh = false }: { p: typeof NEW_PERSON; fresh?: boolean }) {
  return (
    <motion.div className={`wl-td-person${fresh ? " wl-td-fresh" : ""}`} initial={fresh ? { opacity: 0, height: 0 } : false} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.5, ease: EASE }}>
      <b style={{ background: p.color }}>{p.initials}</b>
      <span>{p.name}</span>
      <i>{p.role}</i>
    </motion.div>
  );
}

function Toast({ beat }: { beat: number }) {
  const fired = beat === 4;
  return (
    <AnimatePresence>
      {beat >= 4 && (
        <motion.div className="wl-td-toast" initial={{ opacity: 0, y: -16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.5, ease: EASE }}>
          <span className="wl-dot" style={{ background: fired ? "var(--wl-red)" : "var(--wl-green)" }} />
          <div>
            <b>{fired ? "Error rate is 3.4% (above 2%)" : "Error rate is 1.1% (no longer above 2%)"}</b>
            <span>orders-api · production · sent to Slack</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Keys({ beat }: { beat: number }) {
  const made = beat >= 3;
  const masked = beat >= 4;
  return (
    <div className="wl-td-keys">
      <div className="wl-td-key"><span>Read key · agents</span><code>wl_rk_••••••••3a1d</code></div>
      <AnimatePresence>
        {made && (
          <motion.div className={`wl-td-key${masked ? "" : " wl-td-key-new"}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <span>Ingest key · orders-api</span>
            <code>{masked ? "wl_ik_••••••••8f2c" : "wl_ik_5d0e91b7c4a2f6e38f2c"}</code>
            {!masked && <em>Shown once. Copy it now.</em>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// The cloud hero: a small Team page that runs by itself.
export function TeamDemo() {
  const box = useRef<HTMLDivElement>(null);
  const beat = useBeat(useInView(box, { amount: 0.3 }));
  return (
    <div className="wl-td" ref={box} aria-hidden>
      <div className="wl-td-head">
        <b>Fieldnote</b>
        <span>3 projects · production, staging</span>
        <button type="button" tabIndex={-1} className={beat === 1 ? "wl-td-press" : undefined}>Invite</button>
      </div>
      <AnimatePresence>
        {beat >= 1 && beat < 3 && (
          <motion.div className="wl-td-invite" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            Invite link copied · works once, for 7 days
          </motion.div>
        )}
      </AnimatePresence>
      <div className="wl-td-people">
        {PEOPLE.map((p) => <Person key={p.initials} p={p} />)}
        <AnimatePresence>{beat >= 2 && <Person key="new" p={NEW_PERSON} fresh />}</AnimatePresence>
      </div>
      <Keys beat={beat} />
      <Toast beat={beat} />
    </div>
  );
}
