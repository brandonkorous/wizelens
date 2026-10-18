"use client";

import { useRef, type ReactNode } from "react";
import { motion, useInView, useScroll, useSpring } from "motion/react";

// The line down the side of the changelog: it fills as you read, and each release's dot lights up when you reach it.
export function ReleaseRail({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: box, offset: ["start 60%", "end 60%"] });
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return (
    <div className="wl-cl-list" ref={box}>
      <div className="wl-cl-rail" aria-hidden><motion.span style={{ scaleY: fill }} /></div>
      {children}
    </div>
  );
}

export function ReleaseDot({ current }: { current: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { margin: "0px 0px -40% 0px", once: true });
  return (
    <motion.span
      ref={ref}
      className={`wl-cl-dot${current ? " wl-cl-dot-now" : ""}`}
      initial={{ scale: 0.6, backgroundColor: "#d3d8e0" }}
      animate={seen ? { scale: 1, backgroundColor: current ? "#22c55e" : "#2563eb" } : {}}
      transition={{ type: "spring", stiffness: 300, damping: 18 }}
      aria-hidden
    />
  );
}
