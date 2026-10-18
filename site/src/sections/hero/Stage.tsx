"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Aperture } from "@/components/brand/Aperture";
import { HudCard } from "@/components/hud/HudCard";
import { HudPanel } from "@/components/hud/HudPanel";
import { FakeApp } from "./FakeApp";
import { useDemoLoop } from "./useDemoLoop";

function Cursor({ x, y, down }: { x: number; y: number; down: boolean }) {
  return (
    <motion.div className="wl-cursor" initial={false} animate={{ x, y, scale: down ? 0.86 : 1 }} transition={{ type: "spring", stiffness: 140, damping: 20, mass: 0.9 }}>
      <svg viewBox="0 0 24 24" aria-hidden><path d="M5 3l14 8-6.2 1.6L10 19z" /></svg>
      {down && <motion.span className="wl-cursor-ring" initial={{ scale: 0.2, opacity: 0.7 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.6 }} />}
    </motion.div>
  );
}

// The opening shot: the lens opens, and behind it is your app with WizeLens in the corner.
function Intro() {
  const reduced = useReducedMotion();
  const open = useMotionValue(reduced ? 1 : 0);
  const [done, setDone] = useState(Boolean(reduced));
  const fade = useMotionValue(1);
  const scale = useTransform(fade, [1, 0], [1, 1.6]);

  useEffect(() => {
    if (reduced) return;
    const a = animate(open, 1, { duration: 1.3, delay: 0.25, ease: [0.65, 0, 0.35, 1] });
    const b = animate(fade, 0, { duration: 0.7, delay: 1.45, ease: [0.22, 1, 0.36, 1], onComplete: () => setDone(true) });
    return () => { a.stop(); b.stop(); };
  }, [open, fade, reduced]);

  if (done) return null;
  return (
    <motion.div className="wl-intro wl-night" style={{ opacity: fade }}>
      <motion.div style={{ scale }}>
        <Aperture open={open} className="wl-intro-mark" />
      </motion.div>
    </motion.div>
  );
}

export function Stage() {
  const stage = useRef<HTMLDivElement>(null);
  const inView = useInView(stage, { amount: 0.3 });
  const reduced = useReducedMotion();
  const { sample, cursor, pressed, loading, setButton } = useDemoLoop(stage, inView && !reduced);
  const { scrollYProgress } = useScroll({ target: stage, offset: ["start end", "end start"] });
  const shrink = useTransform(scrollYProgress, [0.5, 1], [1, 0.94]);

  return (
    <motion.div className="wl-stage" ref={stage} style={{ scale: shrink }}>
      <FakeApp sample={sample} pressed={pressed} loading={loading} setButton={setButton} />
      <div className="wl-stage-hud">
        <HudPanel sample={sample} />
        <HudCard sample={sample} />
      </div>
      {cursor && <Cursor x={cursor.x} y={cursor.y} down={pressed !== null} />}
      <Intro />
    </motion.div>
  );
}
