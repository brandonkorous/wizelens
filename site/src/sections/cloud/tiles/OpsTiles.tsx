"use client";

import { motion } from "motion/react";
import { Num } from "@/components/ui/Num";

const ANOMALIES = [
  { where: "pay POST /api/charge", what: "p95 412 ms", normal: "normal 31 ms" },
  { where: "checkout-web", what: "error rate 6.2%", normal: "normal 0.4%" },
  { where: "orders-api", what: "error rate 3.4%", normal: "normal 0.6%" },
];

/** One problem card: what broke together, the suspected cause, and each anomaly against its normal. */
export function ProblemsArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-ct-prob">
      <div className="wl-ct-prob-head"><span className="wl-dot" style={{ background: "var(--wl-red)" }} /><b>Error rate above normal on pay and 2 more</b></div>
      <p>Suspected cause: pay 2.0.0 was released as it started.</p>
      {ANOMALIES.map((a, i) => (
        <motion.div key={a.where} className="wl-ct-prob-row" initial={{ opacity: 0, x: -10 }} animate={seen ? { opacity: 1, x: 0 } : {}} transition={{ delay: 0.4 + i * 0.3, duration: 0.4 }}>
          <span>{a.where}</span><b>{a.what}</b><i>{a.normal}</i>
        </motion.div>
      ))}
    </div>
  );
}

// 30 days per check; a number marks a day with an incident.
const CHECKS = [
  { name: "shop.fieldnote.test", up: 99.98, bad: [] as number[], note: "" },
  { name: "api.fieldnote.test/health", up: 99.71, bad: [11, 24], note: "" },
  { name: "admin.fieldnote.test", up: 100, bad: [], note: "Certificate ends in 9 days" },
];

/** Three checks with a bar per day for 30 days, and the project's public status page. */
export function UptimeArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-ct-up">
      <div className="wl-ct-up-page"><span>Status page</span><b>Public · read-only</b></div>
      {CHECKS.map((c, r) => (
        <div key={c.name} className="wl-ct-up-check">
          <div><span>{c.name}</span><b><Num value={seen ? c.up : 0} decimals={2} suffix="%" /></b></div>
          <div className="wl-ct-up-bars" aria-hidden>
            {Array.from({ length: 30 }, (_, d) => (
              <motion.i key={d} className={c.bad.includes(d) ? "wl-ct-up-bad" : undefined} initial={{ scaleY: 0 }} animate={seen ? { scaleY: 1 } : {}} transition={{ delay: r * 0.2 + d * 0.015, duration: 0.3 }} />
            ))}
          </div>
          {c.note && <em>{c.note}</em>}
        </div>
      ))}
    </div>
  );
}

const SPARK = "M0 30 L12 26 L24 28 L36 18 L48 21 L60 12 L72 15 L84 8 L100 10";

/** An SLO's error budget burns down, next to Apdex and a small dashboard. */
export function SloArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-ct-slo">
      <div className="wl-ct-slo-card">
        <div><b>checkout · 99.5% succeed · 30 days</b><span>Burn: 1 hour 2.1×, 6 hours 0.8×</span></div>
        <div className="wl-ct-slo-track"><motion.i initial={{ width: "100%" }} animate={seen ? { width: "62%" } : {}} transition={{ duration: 1.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} /></div>
        <span><Num value={seen ? 62 : 100} decimals={0} suffix="%" /> of the error budget left</span>
      </div>
      <div className="wl-ct-slo-grid">
        <div><span>Apdex · orders-api</span><b><Num value={seen ? 0.94 : 0} decimals={2} /></b><em>target 500 ms</em></div>
        <div>
          <span>Dashboard · Checkout</span>
          <svg viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden>
            <motion.path d={SPARK} fill="none" stroke="var(--wl-blue)" strokeWidth="2" vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: 1.2 }} />
          </svg>
        </div>
      </div>
    </div>
  );
}
