"use client";

import { useRef, type ReactNode } from "react";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import { CopyCommand } from "@/components/ui/CopyCommand";
import { AppArt, CloudArt, HubArt } from "./GrowArt";

type Stage = { n: string; title: string; license: string; body: string; points: string[]; art: (seen: boolean) => ReactNode; cmd?: string };

const STAGES: Stage[] = [
  {
    n: "1", title: "In your app", license: "MIT",
    body: "One package per service. Each keeps its traces in a small SQLite file, so they survive a restart.",
    points: ["Dashboard at /_wizelens", "Newest 2,000 traces or 24 hours", "Traces across services, with no collector"],
    art: (seen) => <AppArt seen={seen} />,
  },
  {
    n: "2", title: "The local hub", license: "MIT",
    body: "Every service sends to one place on your machine or your network, also when a service is stopped.",
    points: ["7 days in one SQLite file", "Alerts, uptime checks, and SLOs", "Any language over OpenTelemetry"],
    art: (seen) => <HubArt seen={seen} />, cmd: "npx @wizeworks/lens-hub",
  },
  {
    n: "3", title: "WizeLens Cloud", license: "MIT",
    body: "The same dashboard for a whole team, hosted at app.wizelens.com or on your own Postgres.",
    points: ["Organizations, roles, and invites", "14 to 400 days of history", "Alerts to Slack, Teams, Discord, PagerDuty, email, and webhooks", "Public status pages and share links"],
    art: (seen) => <CloudArt seen={seen} />,
  },
];

function StageCard({ s, i }: { s: Stage; i: number }) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { amount: 0.4, once: true });
  return (
    <motion.article ref={ref} className="wl-grow-card" initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}>
      <div className="wl-grow-art">{s.art(seen)}</div>
      <div className="wl-grow-head">
        <span className="wl-grow-n">{s.n}</span>
        <h3 className="wl-h3">{s.title}</h3>
        <span className="wl-grow-lic">{s.license}</span>
      </div>
      <p className="wl-grow-body">{s.body}</p>
      <ul className="wl-grow-points">
        {s.points.map((p) => <li key={p}>{p}</li>)}
      </ul>
      {s.cmd && <CopyCommand command={s.cmd} className="wl-grow-cmd" />}
    </motion.article>
  );
}

export function Grow() {
  const row = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: row, offset: ["start 85%", "start 25%"] });
  const line = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <section className="wl-section">
      <div className="wl-wrap">
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">Start in one app. Grow to a team.</h2>
          <p className="wl-lede">The same dashboard at every step. Move up when you need to, and not before.</p>
        </div>
        <div className="wl-grow" ref={row}>
          <div className="wl-grow-rail" aria-hidden><motion.span style={{ scaleX: line }} /></div>
          {STAGES.map((s, i) => <StageCard key={s.title} s={s} i={i} />)}
        </div>
      </div>
    </section>
  );
}
