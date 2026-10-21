"use client";

import { motion } from "motion/react";
import { Num } from "@/components/ui/Num";

const USERS = [
  { name: "Ada Moreno", id: "u-1042", requests: 412, failed: 0, p95: 180 },
  { name: "Mina Okafor", id: "u-0387", requests: 268, failed: 9, p95: 640 },
  { name: "Ravi Kapoor", id: "u-2210", requests: 151, failed: 0, p95: 95 },
  { name: "Leo Tanaka", id: "u-0915", requests: 97, failed: 1, p95: 210 },
];

/** The Users page: each signed-in user with their requests, failures, and p95. */
export function UsersArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-us">
      <div className="wl-us-row wl-us-head">
        <span>User</span>
        <span>Requests</span>
        <span>Failed</span>
        <span>p95</span>
      </div>
      {USERS.map((u, i) => (
        <motion.div
          key={u.id}
          className={`wl-us-row${u.failed > 5 ? " wl-us-hot" : ""}`}
          initial={{ opacity: 0, y: 8 }}
          animate={seen ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.15 + i * 0.12 }}
        >
          <span className="wl-us-who"><b>{u.name}</b><code>{u.id}</code></span>
          <span><Num value={seen ? u.requests : 0} decimals={0} duration={1.2} /></span>
          <span className="wl-us-failed"><Num value={seen ? u.failed : 0} decimals={0} duration={1.2} /></span>
          <span className="wl-num">{u.p95} ms</span>
        </motion.div>
      ))}
    </div>
  );
}
