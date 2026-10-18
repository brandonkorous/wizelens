"use client";

const LINES = [
  { lvl: "info", svc: "gateway-api", from: "Serilog", msg: "Loaded 8 customers" },
  { lvl: "info", svc: "orders-api", from: "pino", msg: "GET /orders 200 in 3.9 ms" },
  { lvl: "warn", svc: "orders-api", from: "pino", msg: "Query took 398 ms on order_lines" },
  { lvl: "info", svc: "web", from: "console", msg: "Cart updated (3 items)" },
  { lvl: "error", svc: "gateway-api", from: "ILogger", msg: "Sequence contains no elements" },
  { lvl: "info", svc: "billing", from: "winston", msg: "Invoice 1042 sent" },
  { lvl: "debug", svc: "gateway-api", from: "NLog", msg: "Cache hit: products:all" },
  { lvl: "info", svc: "search", from: "bunyan", msg: "Index refreshed (24 docs)" },
  { lvl: "warn", svc: "web", from: "console", msg: "Image hero.jpg took 1.4 s" },
];

const SVC_COLOR: Record<string, string> = {
  "gateway-api": "#7aa2f7",
  "orders-api": "#3fcfb4",
  web: "#a78bfa",
  billing: "#ff9a52",
  search: "#38bdf8",
};

function Line({ l }: { l: (typeof LINES)[number] }) {
  return (
    <div className="wl-lg-line">
      <span className={`wl-lg-lvl wl-lg-${l.lvl}`}>{l.lvl}</span>
      <span className="wl-lg-svc" style={{ color: SVC_COLOR[l.svc] }}>{l.svc}</span>
      <span className="wl-lg-from">{l.from}</span>
      <span className="wl-lg-msg">{l.msg}</span>
    </div>
  );
}

// A log stream that keeps moving; the list is drawn twice so the loop has no seam.
export function LogsArt({ seen }: { seen: boolean }) {
  return (
    <div className="wl-lg">
      <div className={`wl-lg-reel${seen ? " wl-lg-run" : ""}`}>
        {[...LINES, ...LINES].map((l, i) => <Line key={i} l={l} />)}
      </div>
    </div>
  );
}
