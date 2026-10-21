"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

const QUERIES = ["status:5xx path:/api/*", "duration:>300ms", "order_lines"];

// What Ctrl K lists for each query: search hits, then error groups, queries, and insights by name.
const ITEMS = [
  { kind: "Search", text: "Search everything for this", key: "status:5xx path:/api/*" },
  { kind: "Request", text: "GET /api/boom · 500 · 28 ms", key: "status:5xx path:/api/*" },
  { kind: "Request", text: "POST /api/orders · 201 · 642 ms", key: "duration:>300ms" },
  { kind: "Request", text: "GET /api/customers-with-orders · 200 · 305 ms", key: "duration:>300ms" },
  { kind: "Query", text: "SELECT * FROM order_lines WHERE sku LIKE @p0", key: "order_lines" },
  { kind: "Insight", text: "Slow query: 398 ms", key: "order_lines" },
];

function useTyping(active: boolean): string {
  const [text, setText] = useState("");
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active) return;
    if (reduced) { setText(QUERIES[0]!); return; }
    let q = 0;
    let n = 0;
    let wait = 0;
    const id = window.setInterval(() => {
      const target = QUERIES[q]!;
      if (n < target.length) { n++; setText(target.slice(0, n)); return; }
      if (++wait < 18) return;
      wait = 0; n = 0; q = (q + 1) % QUERIES.length; setText("");
    }, 90);
    return () => window.clearInterval(id);
  }, [active, reduced]);
  return text;
}

export function SearchArt({ seen }: { seen: boolean }) {
  const text = useTyping(seen);
  const done = QUERIES.find((q) => q === text);
  const hits = done ? ITEMS.filter((i) => i.key === done) : [];
  return (
    <div className="wl-ck">
      <div className="wl-ck-box">
        <span className="wl-ck-text">{text}<i className="wl-ck-caret" /></span>
        <kbd>Ctrl K</kbd>
      </div>
      <div className="wl-ck-list">
        {hits.map((h) => (
          <div key={h.text} className="wl-ck-item">
            <span>{h.kind}</span>
            <b>{h.text}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
