"use client";

import { motion } from "motion/react";

type Tag = { name: string; color: string };

const CHECKOUT: Tag = { name: "checkout", color: "var(--wl-blue)" };
const PROBE: Tag = { name: "probe", color: "var(--wl-slate)" };
const BOT: Tag = { name: "bot", color: "var(--wl-orange)" };
const STREAM: Tag = { name: "stream", color: "var(--wl-green)" };

const ROWS: { req: string; code: number; tag?: Tag }[] = [
  { req: "POST /api/orders", code: 201, tag: CHECKOUT },
  { req: "GET /healthz", code: 200, tag: PROBE },
  { req: "GET /api/customers-with-orders", code: 200 },
  { req: "GET /wp-login.php", code: 404, tag: BOT },
  { req: "POST /api/orders/1042/pay", code: 200, tag: CHECKOUT },
  { req: "GET /_wizelens/mcp", code: 200, tag: STREAM },
];

/** A saved search becomes a tag, and each request it finds puts on the chip. */
export function TagsArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-tg">
      <div className="wl-tg-rule">
        <span className="wl-tg-chip" style={{ color: CHECKOUT.color }}>{CHECKOUT.name}</span>
        <code>path:/api/orders* method:POST</code>
      </div>
      {ROWS.map((r, i) => (
        <div key={r.req} className="wl-tg-row">
          <code>{r.req}</code>
          <span className="wl-num wl-muted">{r.code}</span>
          {r.tag && (
            <motion.span
              className="wl-tg-chip"
              style={{ color: r.tag.color }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={seen ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.4 + i * 0.14, type: "spring", stiffness: 320, damping: 20 }}
            >
              {r.tag.name}
            </motion.span>
          )}
        </div>
      ))}
    </div>
  );
}
