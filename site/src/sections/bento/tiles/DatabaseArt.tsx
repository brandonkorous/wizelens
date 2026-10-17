"use client";

import { motion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

const QUERIES = [
  { sql: 'SELECT "c"."Id", "c"."Name" FROM "Customers"', ms: 2.1, from: "EF Core" },
  { sql: "SELECT id, total FROM orders WHERE customer_id = ?", ms: 0.4, from: "node:sqlite" },
  { sql: "SELECT * FROM order_lines ORDER BY created_at", ms: 398, from: "Dapper", slow: true },
  { sql: "INSERT INTO orders (customer_id, total) VALUES …", ms: 6.1, from: "Prisma" },
  { sql: "UPDATE stock SET qty = qty - $1 WHERE sku = $2", ms: 3.4, from: "Drizzle" },
  { sql: "SELECT name FROM products WHERE id = ANY($1)", ms: 1.2, from: "pg" },
];

const DRIVERS = ["EF Core", "Dapper", "ADO.NET", "Prisma", "Drizzle", "TypeORM", "pg", "mysql2", "better-sqlite3", "node:sqlite"];

const MAX = Math.sqrt(398);

export function DatabaseArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-db">
      <div className="wl-db-rows">
        {QUERIES.map((q, i) => (
          <div key={q.sql} className={`wl-db-row${q.slow ? " wl-db-slow" : ""}`}>
            <div className="wl-db-top">
              <code>{q.sql}</code>
              <span className="wl-db-ms wl-num">{q.ms} ms</span>
            </div>
            <div className="wl-db-meta">
              <span>{q.from}</span>
              <span className="wl-db-track">
                <motion.i
                  initial={{ width: 0 }}
                  animate={{ width: seen ? `${Math.max(2, (Math.sqrt(q.ms) / MAX) * 100)}%` : 0 }}
                  transition={{ duration: 0.9, delay: 0.1 + i * 0.09, ease: EASE }}
                />
              </span>
              {q.slow && (
                <motion.b className="wl-db-tag" initial={{ opacity: 0, scale: 0.7 }} animate={seen ? { opacity: 1, scale: 1 } : {}} transition={{ delay: 1.1, type: "spring", stiffness: 300, damping: 18 }}>
                  slow
                </motion.b>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="wl-db-drivers">
        {DRIVERS.map((d) => <span key={d}>{d}</span>)}
      </div>
    </div>
  );
}
