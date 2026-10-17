"use client";

import { motion } from "motion/react";
import { ArrowRight, GitHubIcon } from "@/components/ui/icons";
import { LINKS } from "@/lib/links";
import { Stage } from "./Stage";

const EASE = [0.22, 1, 0.36, 1] as const;

function Line({ children, delay }: { children: string; delay: number }) {
  return (
    <span className="wl-line-mask">
      <motion.span className="wl-line" initial={{ y: "105%" }} animate={{ y: "0%" }} transition={{ duration: 0.9, delay, ease: EASE }}>
        {children}
      </motion.span>
    </span>
  );
}

export function Hero() {
  return (
    <section className="wl-hero" id="top">
      <div className="wl-wrap">
        <div className="wl-hero-head">
          <h1 className="wl-display">
            <Line delay={0.1}>See what</Line>
            <Line delay={0.2}>matters.</Line>
          </h1>
          <motion.div className="wl-hero-side" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.45, ease: EASE }}>
            <p className="wl-lede">
              WizeLens shows you everything one request did. The click in React, your .NET and Node services, every
              SQL query, and the render, on one timeline. The problems are found for you.
            </p>
            <div className="wl-hero-cta">
              <a href={LINKS.docs} className="wl-btn wl-btn-primary">Get started <ArrowRight /></a>
              <a href={LINKS.repo} className="wl-btn wl-btn-ghost"><GitHubIcon /> View on GitHub</a>
            </div>
            <p className="wl-hero-note">Open source under MIT. For .NET 10, Node, React, and Next.js.</p>
          </motion.div>
        </div>
        <Stage />
      </div>
    </section>
  );
}
