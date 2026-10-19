"use client";

import { motion } from "motion/react";
import { MAX_K, SOURCES, VENDORS, type Part, type Vendor } from "./cost";

const KEY: { kind: Part["kind"]; label: string }[] = [
  { kind: "license", label: "License" },
  { kind: "setup", label: "Setup (estimate)" },
  { kind: "staff", label: "Staff time (estimate)" },
  { kind: "total", label: "All in (estimate)" },
];

function Bar({ v, i }: { v: Vendor; i: number }) {
  const ours = v.name.startsWith("WizeLens");
  return (
    <div className={`wl-tc-row${ours ? " wl-tc-ours" : ""}`}>
      <div className="wl-tc-name"><b>{v.name}</b><strong className="wl-num">{v.total}</strong></div>
      <div className="wl-tc-track">
        {v.parts.map((p, j) => (
          <motion.i key={p.kind} className={`wl-tc-${p.kind}`} title={p.label} aria-label={p.label}
            initial={{ width: 0 }} whileInView={{ width: `${Math.max(0.6, (p.value / MAX_K) * 100)}%` }}
            viewport={{ once: true, amount: 0.8 }} transition={{ duration: 0.9, delay: i * 0.15 + j * 0.25, ease: [0.22, 1, 0.36, 1] }}>
            {p.kind !== "range" && p.value >= 25 ? `$${p.value}K` : ""}
          </motion.i>
        ))}
      </div>
      <p>{v.note}</p>
    </div>
  );
}

// Year one for a 40-developer company: list prices, plus the setup and staff time they bring.
export function TotalCost() {
  return (
    <section className="wl-section wl-night" id="total-cost">
      <div className="wl-wrap">
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">What 40 developers pay in year one.</h2>
          <p className="wl-lede">License prices are public. Setup and the people to run it are most of the bill. WizeLens is two lines per app, with no agent and no collector to run.</p>
        </div>
        <div className="wl-tc">{VENDORS.map((v, i) => <Bar key={v.name} v={v} i={i} />)}</div>
        <ul className="wl-tc-key">
          {KEY.map((k) => <li key={k.kind}><i className={`wl-tc-${k.kind}`} />{k.label}</li>)}
          <li><i className="wl-tc-ours-key" />WizeLens</li>
        </ul>
        <p className="wl-tc-foot">
          A 40-developer company sending about 2.5 TB a month, year one. Licenses are list prices from the{" "}
          {SOURCES.map((s, i) => <span key={s.href}>{i ? " and the " : ""}<a href={s.href} rel="noopener" target="_blank">{s.label}</a></span>)}.
          Setup and staff figures are estimates, not quotes. Your numbers will differ.
        </p>
      </div>
    </section>
  );
}
