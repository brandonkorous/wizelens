"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { Headline, riseDelay } from "@/components/ui/Headline";
import { ArrowRight } from "@/components/ui/icons";
import { LINKS } from "@/lib/links";
import { CHAPTERS } from "./scene";
import { StoryScene } from "./StoryScene";

const EASE = [0.22, 1, 0.36, 1] as const;

const PRINCIPLES = [
  { title: "Drop-in, not a platform.", body: "Two lines in .NET, one in Node, one provider in React. No agent, no collector, no account." },
  { title: "Built on open standards.", body: "OpenTelemetry shapes and the W3C traceparent header. Anything that speaks OTLP can join." },
  { title: "Opinionated.", body: "It does not just show you the data. It points at the N+1, the duplicate, and the slow query." },
  { title: "Yours.", body: "Your data stays on your machine until you send it somewhere. On in development only." },
  { title: "AI-ready, not AI-bundled.", body: "No AI inside. A read-only, redacted door your own agent can use, if you open it." },
];

const CREDITS = [
  { name: "Glimpse", note: "the original \"see inside the request\" tool for ASP.NET" },
  { name: "MiniProfiler", note: "fast, focused timing" },
  { name: "ELMAH", note: "error logging done right" },
];

function Chapters() {
  const track = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.4 });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (p) => setActive(Math.min(CHAPTERS.length - 1, Math.floor(p * CHAPTERS.length))));
  return (
    <section className="wl-story-track" ref={track}>
      <div className="wl-story-pin">
        <div className="wl-wrap wl-story-grid">
          <div className="wl-story-text">
            {CHAPTERS.map((c, i) => (
              <motion.div key={c.title} className="wl-story-ch" animate={{ opacity: i === active ? 1 : 0, y: i === active ? 0 : i < active ? -24 : 24 }} transition={{ duration: 0.5, ease: EASE }} aria-hidden={i !== active}>
                <h2 className="wl-h2">{c.title}</h2>
                <p className="wl-lede">{c.body}</p>
              </motion.div>
            ))}
          </div>
          <div className="wl-story-stage wl-night"><StoryScene progress={progress} /></div>
        </div>
      </div>
    </section>
  );
}

function Principles() {
  return (
    <section className="wl-section wl-paper">
      <div className="wl-wrap">
        <h2 className="wl-h2 wl-st-h2">What we kept, and what we changed.</h2>
        <ol className="wl-principles">
          {PRINCIPLES.map((p, i) => (
            <motion.li key={p.title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.6, delay: i * 0.06, ease: EASE }}>
              <span className="wl-num">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="wl-h3">{p.title}</h3>
              <p>{p.body}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Credits() {
  return (
    <section className="wl-section">
      <div className="wl-wrap wl-credits">
        <h2 className="wl-h2">Standing on good shoulders.</h2>
        <div>
          <ul>
            {CREDITS.map((c) => <li key={c.name}><b>{c.name}</b><span>{c.note}</span></li>)}
          </ul>
          <p className="wl-credits-note">WizeLens is an independent project. It is not affiliated with Glimpse, MiniProfiler, or ELMAH, or the people who made them.</p>
          <div className="wl-hero-cta">
            <a href={LINKS.start} className="wl-btn wl-btn-primary">Try it in five minutes <ArrowRight /></a>
            <a href="/docs/" className="wl-btn wl-btn-ghost">Read the docs</a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Story() {
  return (
    <main>
      <section className="wl-story-hero">
        <div className="wl-wrap">
          <Headline lines={["Glimpse,", "rebuilt."]} />
          <p className="wl-lede wl-story-lede wl-rise" style={riseDelay(0.35)}>
            You used to be able to open the hood on one request and see everything it did. Then the way we build changed,
            and that view went away. This is the story of why we built it back.
          </p>
        </div>
      </section>
      <Chapters />
      <Principles />
      <Credits />
    </main>
  );
}
