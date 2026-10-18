"use client";

import { motion } from "motion/react";

const COLS = ["In your app", "The local hub", "WizeLens Cloud"];

const ROWS: [string, string, string, string][] = [
  ["Data lives in", "A SQLite file next to each app", "One SQLite file", "Postgres"],
  ["How far back", "24 hours or 2,000 traces", "7 days", "30 days (1 to 400)"],
  ["Services", "Found by following the trace", "Every service, plus any OpenTelemetry app", "Every service, by project and environment"],
  ["People", "You", "Your team, with one shared token", "Organizations, roles, and invites"],
  ["Alerts", "", "", "Webhooks and Slack"],
  ["Share links", "", "", "Read-only, 1 to 30 days"],
  ["AI access", "One read-only endpoint per service", "One endpoint for every service", "Read keys per project, audited"],
];

// Where each way of running WizeLens fits, side by side.
export function Compare() {
  return (
    <section className="wl-section">
      <div className="wl-wrap">
        <div className="wl-head wl-head-split">
          <h2 className="wl-h2">Same dashboard. Pick the size.</h2>
          <p className="wl-lede">Start in your app. Move to the hub or the cloud when you need to. Nothing about the dashboard changes.</p>
        </div>
        <div className="wl-compare" role="table" aria-label="In your app, the local hub, and WizeLens Cloud compared">
          <div className="wl-compare-row wl-compare-head" role="row">
            <span role="columnheader" />
            {COLS.map((c) => <b key={c} role="columnheader">{c}</b>)}
          </div>
          {ROWS.map((r, i) => (
            <motion.div key={r[0]} className="wl-compare-row" role="row" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.6 }} transition={{ duration: 0.5, delay: i * 0.04 }}>
              <span role="rowheader">{r[0]}</span>
              {r.slice(1).map((cell, j) => <span key={j} role="cell" data-col={`${COLS[j]}: `} className={cell ? undefined : "wl-compare-none"}>{cell || "Not here"}</span>)}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
