"use client";

import { useEffect } from "react";
import { animate, useMotionValue, useReducedMotion } from "motion/react";
import { Aperture } from "./Aperture";

// The mark closes once, slowly, and stays shut.
export function ClosedLens() {
  const open = useMotionValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { open.set(0.08); return; }
    const a = animate(open, 0.08, { duration: 1.6, delay: 0.3, ease: [0.65, 0, 0.35, 1] });
    return () => a.stop();
  }, [open, reduced]);
  return <Aperture open={open} className="wl-404-mark" />;
}
