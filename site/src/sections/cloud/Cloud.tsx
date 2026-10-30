"use client";

import { motion } from "motion/react";
import { Headline, riseDelay } from "@/components/ui/Headline";
import { CopyCommand } from "@/components/ui/CopyCommand";
import { ArrowRight } from "@/components/ui/icons";
import { Compare } from "./Compare";
import { OpsFeatures } from "./OpsFeatures";
import { TeamDemo } from "./TeamDemo";
import { TeamFeatures } from "./TeamFeatures";
import { START_URL } from "../pricing/plans";

const EASE = [0.22, 1, 0.36, 1] as const;

const SAFE = [
  "Keys are stored as hashes. The secret is shown once.",
  "The sign-in cookie is HttpOnly, and secure on https.",
  "Every change from a browser needs a header another site cannot send.",
  "Webhooks cannot reach private addresses unless you allow it.",
  "Passwords, tokens, and keys are redacted before they are stored.",
  "Every MCP call goes to the audit log, with the key, or the person and app, that made it.",
  "Two-step sign-in, passkeys, and a breached-password check.",
  "A fresh cloud needs its one-time setup link, so nobody else can claim it.",
];

function Hero() {
  return (
    <section className="wl-cloud-hero">
      <div className="wl-wrap wl-cloud-hero-grid">
        <div className="wl-cloud-copy">
          <Headline lines={["The same lens,", "for the team."]} />
          <div className="wl-cloud-intro wl-rise" style={riseDelay(0.35)}>
            <p className="wl-lede">WizeLens Cloud is the dashboard you already know, with accounts, single sign-on, history, alerts, uptime checks, share links, and AI access you can scope. Start free at app.wizelens.com, or run it yourself on your own Postgres, with ClickHouse when you grow.</p>
            <div className="wl-hero-cta">
              <a href={START_URL} className="wl-btn wl-btn-primary">Start free <ArrowRight /></a>
              <a href="/pricing/" className="wl-btn wl-btn-ghost">See pricing</a>
            </div>
            <CopyCommand command="npx @wizeworks/lens-cloud" />
          </div>
        </div>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.3, ease: EASE }}>
          <TeamDemo />
        </motion.div>
      </div>
    </section>
  );
}

function SelfHost() {
  return (
    <section className="wl-section wl-night">
      <div className="wl-wrap wl-cloud-self">
        <div>
          <h2 className="wl-h2">Run it yourself.</h2>
          <p className="wl-lede">One Docker Compose file with Postgres, and ClickHouse when you need scale. Put it behind https, create the first account from the setup link it prints, and you own the first organization.</p>
        </div>
        <div className="wl-cloud-steps">
          <CopyCommand command="docker compose -f deploy/docker-compose.cloud.yml up -d" />
          <ol>
            <li><b>Start it</b> with POSTGRES_PASSWORD, WIZELENS_CLOUD_AUTH_SECRET, and WIZELENS_CLOUD_PUBLIC_URL set.</li>
            <li><b>Open the setup link</b> in the log to make the first account, then invite your team.</li>
            <li><b>Make an ingest key</b> per app and set WIZELENS_ENDPOINT and WIZELENS_TOKEN.</li>
          </ol>
          <ul className="wl-cloud-safe">{SAFE.map((s) => <li key={s}>{s}</li>)}</ul>
          <div className="wl-hero-cta">
            <a href="/docs/cloud/" className="wl-btn wl-btn-ghost">Self-host guide <ArrowRight /></a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Cloud() {
  return (
    <main>
      <Hero />
      <TeamFeatures />
      <OpsFeatures />
      <Compare />
      <SelfHost />
    </main>
  );
}
