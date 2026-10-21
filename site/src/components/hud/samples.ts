import type { Health } from "@/lib/health";

export type SpanKind = "net" | "server" | "db" | "render" | "error";

export type SpanRow = { label: string; ms: string; start: number; dur: number; kind: SpanKind; depth: number };

export type HudInsight = { tag: string; title: string; ms: string; detail: string; tone: Health };

export type HudSample = {
  id: string;
  button: string;
  method: string;
  path: string;
  code: number;
  health: Health;
  time: string;
  service: string;
  total: number;
  server: number;
  db: number;
  render: number;
  sql: number;
  fetch: number;
  errors: number;
  scale: number;
  rows: SpanRow[];
  insights: HudInsight[];
};

const N_PLUS_ONE: HudSample = {
  id: "n1", button: "customers", method: "GET", path: "/api/customers-with-orders", code: 200, health: "opportunity",
  time: "8:54:51 PM", service: "gateway-api", total: 305, server: 263, db: 9.6, render: 35, sql: 17, fetch: 8, errors: 0, scale: 300,
  rows: [
    { label: "fetch /api/customers-with-orders", ms: "270 ms", start: 0, dur: 270, kind: "net", depth: 0 },
    { label: "GET /api/customers-with-orders", ms: "263 ms", start: 5, dur: 263, kind: "server", depth: 1 },
    { label: "gateway-api · 9 queries", ms: "7.9 ms", start: 72, dur: 186, kind: "db", depth: 2 },
    { label: "GET localhost:5291/orders", ms: "45 ms", start: 180, dur: 45, kind: "net", depth: 2 },
    { label: "GET /orders", ms: "3.9 ms", start: 221, dur: 4, kind: "server", depth: 3 },
    { label: "SELECT orders", ms: "0.3 ms", start: 223, dur: 1.5, kind: "db", depth: 4 },
  ],
  insights: [
    { tag: "N+1 query", title: "N+1 query: ran 8 times", ms: "2.9 ms", detail: 'SELECT "c"."Id", "c"."Email", "c"."Name" FROM "Customers"…', tone: "warning" },
    { tag: "N+1 HTTP", title: "N+1 HTTP: called 8 times", ms: "45 ms", detail: "GET localhost:5291/orders?customerId={}", tone: "warning" },
    { tag: "N+1 query", title: "N+1 query: ran 8 times", ms: "2.4 ms", detail: "SELECT id, product, amount FROM orders WHERE customer_id = ?", tone: "warning" },
  ],
};

const FAST: HudSample = {
  id: "ok", button: "products", method: "GET", path: "/api/products", code: 200, health: "success",
  time: "8:55:03 PM", service: "gateway-api", total: 112, server: 74, db: 21, render: 17, sql: 4, fetch: 1, errors: 0, scale: 120,
  rows: [
    { label: "fetch /api/products", ms: "95 ms", start: 0, dur: 95, kind: "net", depth: 0 },
    { label: "GET /api/products", ms: "92 ms", start: 2, dur: 92, kind: "server", depth: 1 },
    { label: "SELECT products", ms: "18 ms", start: 30, dur: 18, kind: "db", depth: 2 },
    { label: "SELECT categories", ms: "2.8 ms", start: 50, dur: 3, kind: "db", depth: 2 },
    { label: "render ProductGrid", ms: "17 ms", start: 95, dur: 17, kind: "render", depth: 0 },
  ],
  insights: [],
};

const SLOW: HudSample = {
  id: "slow", button: "order", method: "POST", path: "/api/orders", code: 201, health: "warning",
  time: "8:55:18 PM", service: "gateway-api", total: 642, server: 168, db: 412, render: 62, sql: 6, fetch: 2, errors: 0, scale: 660,
  rows: [
    { label: "fetch /api/orders", ms: "580 ms", start: 0, dur: 580, kind: "net", depth: 0 },
    { label: "POST /api/orders", ms: "575 ms", start: 3, dur: 575, kind: "server", depth: 1 },
    { label: "INSERT orders", ms: "6.1 ms", start: 40, dur: 8, kind: "db", depth: 2 },
    { label: "SELECT order_lines", ms: "398 ms", start: 52, dur: 398, kind: "db", depth: 2 },
    { label: "POST localhost:5291/stock", ms: "41 ms", start: 470, dur: 41, kind: "net", depth: 2 },
    { label: "render OrderConfirmation", ms: "62 ms", start: 580, dur: 62, kind: "render", depth: 0 },
  ],
  insights: [
    { tag: "Slow query", title: "Slow query: 398 ms", ms: "398 ms", detail: "SELECT * FROM order_lines WHERE sku LIKE @p0 ORDER BY…", tone: "warning" },
  ],
};

const FAILED: HudSample = {
  id: "err", button: "boom", method: "GET", path: "/api/boom", code: 500, health: "critical",
  time: "8:55:31 PM", service: "gateway-api", total: 28, server: 26, db: 0, render: 2, sql: 0, fetch: 1, errors: 1, scale: 30,
  rows: [
    { label: "fetch /api/boom", ms: "28 ms", start: 0, dur: 28, kind: "net", depth: 0 },
    { label: "GET /api/boom", ms: "26 ms", start: 1, dur: 26, kind: "server", depth: 1 },
    { label: "InvalidOperationException", ms: "", start: 24, dur: 1, kind: "error", depth: 2 },
  ],
  insights: [
    { tag: "Error", title: "gateway-api: Sequence contains no elements", ms: "26 ms", detail: "GET /api/boom", tone: "critical" },
  ],
};

export const HUD_SAMPLES: HudSample[] = [N_PLUS_ONE, FAST, SLOW, FAILED];
