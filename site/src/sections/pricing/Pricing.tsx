"use client";

import { motion } from "motion/react";
import { Headline, riseDelay } from "@/components/ui/Headline";
import { CopyCommand } from "@/components/ui/CopyCommand";
import { ArrowRight } from "@/components/ui/icons";
import { Faq } from "@/sections/faq/Faq";
import { Calculator } from "./Calculator";
import { PRICING_FAQS } from "./faqs";
import { PlanCards } from "./PlanCards";
import { APP_URL } from "./plans";
import { TotalCost } from "./TotalCost";

const EASE = [0.22, 1, 0.36, 1] as const;

const FREE = [
  { name: "The add-ons", body: "MIT licensed. The dashboard and HUD in your .NET, Node, and React apps, and the SDKs for the browser, Java, Python, and Go, with no account." },
  { name: "The hub", body: "MIT licensed. One process and one SQLite file for every service on your machine or team." },
  { name: "The cloud", body: "MIT licensed. Run it yourself on your own Postgres. Billing is off unless you add Stripe keys: no plans, no caps, no prompts." },
];

function Hero() {
  return (
    <section className="wl-cloud-hero wl-pr-hero">
      <div className="wl-wrap wl-cloud-hero-grid">
        <div className="wl-cloud-copy">
          <Headline lines={["Pay for data.", "Not for people."]} />
          <div className="wl-cloud-intro wl-rise" style={riseDelay(0.35)}>
            <p className="wl-lede">Every plan of WizeLens Cloud has unlimited users, alerts, uptime checks, share links, and MCP for your AI agents. You pay for the data you send. Running it yourself is free.</p>
            <div className="wl-hero-cta">
              <a href={APP_URL} className="wl-btn wl-btn-primary">Start free <ArrowRight /></a>
              <a href="#plans" className="wl-btn wl-btn-ghost">See the plans</a>
            </div>
          </div>
        </div>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.3, ease: EASE }}>
          <Calculator />
        </motion.div>
      </div>
    </section>
  );
}

function SelfHost() {
  return (
    <section className="wl-section">
      <div className="wl-wrap">
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">Free forever to self-host.</h2>
          <p className="wl-lede">Only the hosted cloud is paid. Everything else is yours to run, with no limits.</p>
        </div>
        <div className="wl-pr-free">
          {FREE.map((f) => <div key={f.name}><h3 className="wl-h3">{f.name}</h3><p>{f.body}</p></div>)}
        </div>
        <div className="wl-pr-self">
          <CopyCommand command="npx @wizeworks/lens-cloud" />
          <a href="/docs/cloud/" className="wl-btn wl-btn-ghost">Self-host guide <ArrowRight /></a>
        </div>
      </div>
    </section>
  );
}

export function Pricing() {
  return (
    <main>
      <Hero />
      <PlanCards />
      <TotalCost />
      <SelfHost />
      <Faq items={PRICING_FAQS} lede={<>Plans and billing in the <a href="/docs/cloud/#plans-and-billing">cloud docs</a>.</>} />
    </main>
  );
}
