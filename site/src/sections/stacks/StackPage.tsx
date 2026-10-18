"use client";

import { motion } from "motion/react";
import { Headline, riseDelay } from "@/components/ui/Headline";
import { ArrowRight } from "@/components/ui/icons";
import { LINKS } from "@/lib/links";
import { CodeToTrace } from "./CodeToTrace";
import { STACK_LIST } from "./stacks";
import type { Stack } from "./types";

const EASE = [0.22, 1, 0.36, 1] as const;

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.7, delay, ease: EASE },
});

function Hero({ stack }: { stack: Stack }) {
  return (
    <section className="wl-st-hero">
      <div className="wl-wrap">
        <Headline lines={[...stack.headline]} className="wl-display wl-st-title" />
        <div className="wl-st-intro wl-rise" style={riseDelay(0.35)}>
          <p className="wl-lede">{stack.lede}</p>
          <div className="wl-hero-cta">
            <a href={stack.docs[0]!.href} className="wl-btn wl-btn-primary">Set it up <ArrowRight /></a>
            <a href={LINKS.start} className="wl-btn wl-btn-ghost">Quick start</a>
          </div>
        </div>
        <dl className="wl-st-facts">
          {stack.facts.map((f, i) => (
            <motion.div key={f.label} {...rise(0.5 + i * 0.08)}>
              <dt>{f.value}</dt>
              <dd>{f.label}</dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Captures({ stack }: { stack: Stack }) {
  return (
    <section className="wl-section wl-paper">
      <div className="wl-wrap">
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">What gets captured.</h2>
          <p className="wl-lede">Everything below lands in the same trace as the request that caused it.</p>
        </div>
        <div className="wl-st-grid">
          {stack.captures.map((c, i) => (
            <motion.article key={c.title} className="wl-st-card" {...rise(i * 0.06)}>
              <h3 className="wl-h3">{c.title}</h3>
              <ul>{c.items.map((it) => <li key={it}>{it}</li>)}</ul>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Highlights({ stack }: { stack: Stack }) {
  return (
    <section className="wl-section">
      <div className="wl-wrap">
        <h2 className="wl-h2 wl-st-h2">{stack.highlightsTitle}</h2>
        <div className="wl-st-highs">
          {stack.highlights.map((h, i) => (
            <motion.article key={h.title} className="wl-st-high" {...rise(i * 0.08)}>
              <h3 className="wl-h3">{h.title}</h3>
              <p>{h.body}</p>
              {h.code && <code>{h.code}</code>}
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Next({ stack }: { stack: Stack }) {
  const others = STACK_LIST.filter((s) => s.slug !== stack.slug);
  return (
    <section className="wl-section wl-night">
      <div className="wl-wrap wl-st-next">
        <div>
          <h2 className="wl-h2">Mixing stacks? One trace across all of them.</h2>
          <p className="wl-lede">A React front end, a .NET gateway, and a Node service follow the same rules and join the same trace.</p>
          <div className="wl-st-others">
            {others.map((o) => <a key={o.slug} href={`/${o.slug}/`} className="wl-btn wl-btn-ghost">WizeLens for {o.name} <ArrowRight /></a>)}
          </div>
        </div>
        <ul className="wl-st-docs">
          {stack.docs.map((d) => <li key={d.href}><a href={d.href}>{d.label} <ArrowRight /></a></li>)}
        </ul>
      </div>
    </section>
  );
}

export function StackPage({ stack }: { stack: Stack }) {
  return (
    <main>
      <Hero stack={stack} />
      <section className="wl-st-demo">
        <div className="wl-wrap"><CodeToTrace stack={stack} /></div>
      </section>
      <Captures stack={stack} />
      <Highlights stack={stack} />
      <Next stack={stack} />
    </main>
  );
}
