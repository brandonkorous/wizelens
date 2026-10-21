"use client";

import { AnimatePresence, motion } from "motion/react";
import { Num } from "@/components/ui/Num";
import { useStep } from "./useStep";

const FIRST = [
  { text: "Unresolved", tone: "wl-ct-st-open" },
  { text: "Resolved", tone: "wl-ct-st-done" },
  { text: "Regressed", tone: "wl-ct-st-back" },
];

const GROUPS = [
  { name: "TypeError: Cannot read properties of undefined (reading 'id')", count: 214, who: "AM" },
  { name: "SqlException: Execution Timeout Expired", count: 37, who: "", status: "Ignored for a week" },
  { name: "HttpRequestException: 503 from pay", count: 12, who: "RK", status: "Unresolved" },
];

/** The first error group is resolved, then comes back as Regressed; the others are ignored or assigned. */
export function ErrorsArt({ seen }: { seen: boolean }) {
  const s = FIRST[useStep(seen, 3, 2200, 2)]!;
  return (
    <div className="wl-ct-err">
      {GROUPS.map((g, i) => (
        <div key={g.name} className="wl-ct-err-row">
          <span>{g.name}</span>
          <b className="wl-num">{g.count}</b>
          {i === 0 ? (
            <AnimatePresence mode="wait">
              <motion.i key={s.text} className={s.tone} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>{s.text}</motion.i>
            </AnimatePresence>
          ) : <i className={i === 1 ? "wl-ct-st-mute" : "wl-ct-st-open"}>{g.status}</i>}
          <em>{g.who || "–"}</em>
        </div>
      ))}
    </div>
  );
}

const PACKAGES = [
  { eco: "npm", name: "lodash 4.17.15", cve: "CVE-2020-8203", fix: "4.17.19" },
  { eco: "NuGet", name: "Newtonsoft.Json 12.0.1", cve: "CVE-2024-21907", fix: "13.0.1" },
  { eco: "PyPI", name: "requests 2.25.0", cve: "CVE-2023-32681", fix: "2.31.0" },
];

/** Packages your services run, checked against OSV, each with its advisory and the version that fixes it. */
export function PackagesArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-ct-pkg">
      <p>3 packages with known vulnerabilities · checked against OSV</p>
      {PACKAGES.map((p, i) => (
        <motion.div key={p.name} initial={{ opacity: 0, y: 10 }} animate={seen ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.3 + i * 0.3, duration: 0.4 }}>
          <span>{p.eco}</span><b>{p.name}</b><code>{p.cve}</code><em>Fixed in {p.fix}</em>
        </motion.div>
      ))}
    </div>
  );
}

const STATS = [
  { v: 3, label: "of 3 nodes ready" },
  { v: 42, label: "pods" },
  { v: 1, label: "pending pod" },
  { v: 2, label: "restarts, 1 out of memory" },
];

const PODS = [
  { name: "orders-api-7d9f4", node: "node-a", phase: "Running", note: "" },
  { name: "worker-5c2b8", node: "node-b", phase: "Running", note: "2 restarts · 1 OOM" },
  { name: "checkout-web-66f1c", node: "node-c", phase: "Pending", note: "" },
];

/** The Kubernetes page: ready nodes, pods, pending pods, restarts with out-of-memory kills, and the pods list. */
export function HostsArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-ct-k8s">
      <div className="wl-ct-k8s-stats">
        {STATS.map((s) => <div key={s.label}><b><Num value={seen ? s.v : 0} decimals={0} /></b><span>{s.label}</span></div>)}
      </div>
      {PODS.map((p) => (
        <div key={p.name} className="wl-ct-k8s-pod">
          <span>{p.name}</span><i>{p.note || p.node}</i><b className={p.phase === "Running" ? "wl-ct-ok" : "wl-ct-wait"}>{p.phase}</b>
        </div>
      ))}
    </div>
  );
}
