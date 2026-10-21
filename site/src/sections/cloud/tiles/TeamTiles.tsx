"use client";

import { AnimatePresence, motion } from "motion/react";
import { useStep } from "./useStep";

const ROLES = ["Viewer", "Member", "Admin", "Owner"];
const CAN = ["Read", "Alerts, tags, share links", "Projects, keys, people", "Spend cap, delete the org"];

export function RolesArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-ct-roles">
      <div className="wl-ct-roles-row wl-ct-roles-head">
        <span />
        {ROLES.map((r) => <b key={r}>{r}</b>)}
      </div>
      {CAN.map((c, i) => (
        <div key={c} className="wl-ct-roles-row">
          <span>{c}</span>
          {ROLES.map((r, j) => (
            <motion.i key={r} className={j >= i ? "wl-yes" : "wl-no"} initial={{ scale: 0 }} animate={seen ? { scale: 1 } : {}} transition={{ delay: 0.1 * (i + j), type: "spring", stiffness: 400, damping: 20 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

const STATES = [
  { dot: "var(--wl-red)", text: "Error rate is 3.4% (above 2%)" },
  { dot: "var(--wl-green)", text: "Error rate is 1.1% (no longer above 2%)" },
];

export function AlertsArt({ seen }: { seen: boolean }) {
  const i = useStep(seen, 2, 2600);
  const s = STATES[i]!;
  return (
    <div className="wl-ct-alert">
      <p className="wl-ct-rule">When <b>error rate</b> is above <b>2%</b> over <b>5 minutes</b> in <b>production</b>, tell <b>#alerts</b> on Slack.</p>
      <AnimatePresence mode="wait">
        <motion.div key={i} className="wl-ct-notice" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
          <span className="wl-dot" style={{ background: s.dot }} />
          <span>{s.text}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function ShareArt({ seen }: { seen: boolean }) {
  const revoked = useStep(seen, 2, 3200) === 1;
  return (
    <div className={`wl-ct-share${revoked ? " wl-ct-revoked" : ""}`}>
      <div className="wl-ct-share-top">
        <code>…/_wizelens/#/shared/k7Qm2…</code>
        <span>{revoked ? "Revoked" : "Read-only"}</span>
      </div>
      <p>GET /api/customers-with-orders · trace e8fa3b92</p>
      <div className="wl-ct-share-meta">
        <span>Expires in 7 days</span>
        <span>12 views</span>
      </div>
    </div>
  );
}

const AUDIT = [
  "Ada M. made ingest key orders-api",
  "Jo M. invited sara@fieldnote.test as member",
  "read key agents called find_n_plus_one",
  "Ravi K. shared trace e8fa3b92 for 7 days",
  "Ada M. set retention to 90 days",
  "read key agents called get_trace",
];

export function AuditArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-ct-audit">
      <div className={`wl-ct-audit-reel${seen ? " wl-lg-run" : ""}`}>
        {[...AUDIT, ...AUDIT].map((a, i) => <div key={i}><span className="wl-num">{`10:4${i % 10}`}</span>{a}</div>)}
      </div>
    </div>
  );
}
