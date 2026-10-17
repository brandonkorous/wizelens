"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { Aperture } from "@/components/brand/Aperture";
import { ArrowRight, GitHubIcon } from "@/components/ui/icons";
import { LINKS } from "@/lib/links";

const WORDS = ["Inspect.", "Understand.", "Build better."];

function Word({ text, i, progress }: { text: string; i: number; progress: ReturnType<typeof useSpring> }) {
  const from = 0.45 + i * 0.12;
  const opacity = useTransform(progress, [from, from + 0.12], [0.15, 1]);
  return <motion.span className="wl-closing-word" style={{ opacity }}>{text}</motion.span>;
}

// The last scene: the lens opens as you arrive, then the brand line.
export function Closing() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.5 });
  const open = useTransform(progress, [0.1, 0.6], [0, 1]);
  const scale = useTransform(progress, [0.1, 0.6], [0.8, 1]);

  return (
    <section className="wl-closing wl-night" ref={ref}>
      <div className="wl-wrap wl-closing-inner">
        <motion.div className="wl-closing-mark" style={{ scale }}>
          <Aperture open={open} label="WizeLens" />
        </motion.div>
        <h2 className="wl-display wl-closing-line">
          {WORDS.map((w, i) => <Word key={w} text={w} i={i} progress={progress} />)}
        </h2>
        <p className="wl-lede">Better software starts with better visibility.</p>
        <div className="wl-hero-cta wl-closing-cta">
          <a href={LINKS.start} className="wl-btn wl-btn-primary">Get started <ArrowRight /></a>
          <a href={LINKS.repo} className="wl-btn wl-btn-ghost"><GitHubIcon /> Star on GitHub</a>
        </div>
      </div>
    </section>
  );
}
