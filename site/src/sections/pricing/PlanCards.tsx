"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "@/components/ui/icons";
import { APP_URL, PLANS, SALES_MAIL, TIERS, gbText, money, yearlyPrice, type Plan } from "./plans";

const EVERY = ["Unlimited users", "MCP for Claude and other agents", "Alerts to Slack and webhooks", "Share links", "Traces across services"];

function Price({ p, yearly }: { p: Plan; yearly: boolean }) {
  if (p.monthly === null) return <div className="wl-pl-price"><b>Custom</b></div>;
  if (yearly && p.monthly > 0) return <div className="wl-pl-price"><b>{money(yearlyPrice(p))}</b><span>/year</span></div>;
  return <div className="wl-pl-price"><b>{money(p.monthly)}</b><span>/month</span></div>;
}

function Action({ p }: { p: Plan }) {
  if (p.id === "enterprise") return <a href={SALES_MAIL} className="wl-btn wl-btn-ghost">Talk to us <ArrowRight /></a>;
  if (p.id === "free") return <a href={APP_URL} className="wl-btn wl-btn-primary">Start free <ArrowRight /></a>;
  return <a href={APP_URL} className="wl-btn wl-btn-ghost wl-pl-up">Start free, upgrade in the app</a>;
}

function Card({ p, yearly, i }: { p: Plan; yearly: boolean; i: number }) {
  return (
    <motion.article className={`wl-pl${p.id === "team" ? " wl-pl-pick" : ""}`} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.6, delay: i * 0.06 }}>
      <h3>{p.name}</h3>
      <p className="wl-pl-note">{p.note}</p>
      <Price p={p} yearly={yearly} />
      <dl className="wl-pl-facts">
        <div><dt>Data a month</dt><dd>{p.gb ? gbText(p.gb) : "Custom"}</dd></div>
        <div><dt>History</dt><dd>{p.days}</dd></div>
      </dl>
      <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
      <Action p={p} />
    </motion.article>
  );
}

function Period({ yearly, set }: { yearly: boolean; set: (v: boolean) => void }) {
  return (
    <div className="wl-pl-period" role="group" aria-label="Billing period">
      <button type="button" aria-pressed={!yearly} onClick={() => set(false)}>Monthly</button>
      <button type="button" aria-pressed={yearly} onClick={() => set(true)}>Yearly, 2 months free</button>
    </div>
  );
}

// The four plans, the steps for extra data, and what every plan has.
export function PlanCards() {
  const [yearly, setYearly] = useState(false);
  return (
    <section className="wl-section wl-paper" id="plans">
      <div className="wl-wrap">
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">Four plans. No seats.</h2>
          <div className="wl-pl-intro">
            <p className="wl-lede">Pick by how much data you send and how far back you look. Everyone on your team gets in.</p>
            <Period yearly={yearly} set={setYearly} />
          </div>
        </div>
        <div className="wl-pl-grid">{PLANS.map((p, i) => <Card key={p.id} p={p} yearly={yearly} i={i} />)}</div>
        <div className="wl-pl-every">
          <b>Every plan</b>
          <ul>{EVERY.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
        <div className="wl-pl-tiers">
          <b>Extra data on Team and Business</b>
          {TIERS.map((t) => <div key={t.label}><span>{t.label}</span><strong>{money(t.rate)}/GB</strong></div>)}
        </div>
      </div>
    </section>
  );
}
