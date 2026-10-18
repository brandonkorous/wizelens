"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { JourneyMap } from "./JourneyMap";
import { JourneyTimeline } from "./JourneyTimeline";
import { STEPS } from "./steps";

// One click, told as you scroll: the section pins while the trace builds beside the story.
export function Journey() {
  const track = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.4 });
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setActive(Math.min(STEPS.length - 1, Math.max(0, Math.floor(p * STEPS.length))));
  });

  return (
    <section className="wl-journey" id="journey" ref={track}>
      <div className="wl-journey-pin">
        <div className="wl-wrap wl-journey-grid">
          <div className="wl-journey-copy">
            <h2 className="wl-h2">One click. Every hop.</h2>
            <ol className="wl-steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className={i === active ? "wl-step-on" : i < active ? "wl-step-past" : undefined}>
                  <span className="wl-step-n wl-num">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="wl-h3">{s.title}</h3>
                    <p>{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="wl-journey-visual">
            <JourneyMap progress={progress} active={active} />
            <JourneyTimeline progress={progress} />
            <motion.p className="wl-journey-sum" animate={{ opacity: active === STEPS.length - 1 ? 1 : 0, y: active === STEPS.length - 1 ? 0 : 8 }}>
              <span className="wl-dot" style={{ background: "var(--wl-amber)" }} />
              GET /api/customers-with-orders · 305 ms · 36 spans · 3 services · 2 insights
            </motion.p>
            <div className="wl-journey-bar" aria-hidden>
              <motion.span style={{ scaleX: progress, originX: 0 }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
