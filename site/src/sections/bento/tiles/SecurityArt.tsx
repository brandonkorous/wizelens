"use client";

import { motion } from "motion/react";

type Severity = "high" | "medium" | "low";

const RISKS: { owasp: string; title: string; evidence: string; severity: Severity }[] = [
  { owasp: "A05", title: "Request input is written into SQL", evidence: "SELECT * FROM orders WHERE id = 42", severity: "high" },
  { owasp: "A03", title: "A package has a known vulnerability", evidence: "npm lodash@4.17.15 · CVE-2020-8203", severity: "high" },
  { owasp: "A04", title: "A cookie is set without its safety flags", evidence: "cookie sid: missing HttpOnly, Secure", severity: "medium" },
  { owasp: "A07", title: "Many failed sign-ins, and no rate limit seen", evidence: "POST /login · 340 failures, 1 address", severity: "medium" },
  { owasp: "A02", title: "Security headers are missing", evidence: "content-security-policy, x-frame-options", severity: "medium" },
];

/** Risks found in real traffic appear one by one, each with its OWASP category and the evidence. */
export function SecurityArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-sc">
      {RISKS.map((r, i) => (
        <motion.div
          key={r.owasp}
          className="wl-sc-row"
          initial={{ opacity: 0, y: 10 }}
          animate={seen ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5 + 0.35 * i, duration: 0.4 }}
        >
          <span className="wl-sc-owasp">{r.owasp}</span>
          <span className={`wl-sc-sev wl-sc-${r.severity}`}>{r.severity === "high" ? "High" : "Medium"}</span>
          <strong className="wl-sc-title">{r.title}</strong>
          <code className="wl-sc-evidence">{r.evidence}</code>
        </motion.div>
      ))}
    </div>
  );
}
