import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import express from "express";
import { createWizeLens, instrumentNodeSqlite } from "@wizeworks/lens-node";

const PORT = Number(process.env.PORT ?? 5200);

// 1. Create WizeLens. It is on unless NODE_ENV=production.
const wizelens = createWizeLens({
  serviceName: "orders-api",
  enableMcp: true, // AI agents can read traces at /_wizelens/mcp (read-only)
  // Traces survive restarts. The file lives next to this sample (gitignored). WIZELENS_STORAGE_PATH moves it.
  storagePath: process.env.WIZELENS_STORAGE_PATH ?? join(import.meta.dirname, "..", ".wizelens", "traces.db"),
  logToConsole: true,
});
const log = wizelens.logger;

// 2. A small SQLite database. One call traces every query it runs.
const db = new DatabaseSync(join(import.meta.dirname, "..", "orders.db"));
instrumentNodeSqlite(wizelens, db);

db.exec(`CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  product TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL
)`);
const { n } = db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number };
if (n === 0) {
  const products = ["Keyboard", "Mouse", "Monitor", "Headset", "Webcam", "Dock", "Cable", "Chair"];
  const insert = db.prepare("INSERT INTO orders (customer_id, product, amount, created_at) VALUES (?, ?, ?, ?)");
  for (let customer = 1; customer <= 8; customer++) {
    for (let i = 0; i < 2 + (customer % 3); i++) {
      const product = products[(customer + i) % products.length]!;
      const amount = Math.round((19 + ((customer * 37 + i * 53) % 400)) * 100) / 100;
      insert.run(customer, product, amount, new Date(Date.UTC(2026, 9, customer, 9 + i)).toISOString());
    }
  }
}

const app = express();

// 3. Mount WizeLens first. It also serves the dashboard at /_wizelens/.
app.use(wizelens.middleware);

app.get("/orders", (req, res) => {
  const customerId = Number(req.query.customerId);
  if (!Number.isInteger(customerId)) {
    log.warn("customerId missing or invalid", { customerId: String(req.query.customerId) });
    res.status(400).json({ error: "customerId is required" });
    return;
  }
  const sql = "SELECT id, customer_id AS customerId, product, amount, created_at AS createdAt FROM orders WHERE customer_id = ? ORDER BY id";
  // Tags and the user show in the dashboard's request panel.
  wizelens.setUser(`customer-${customerId}`);
  const rows = db.prepare(sql).all(customerId);
  wizelens.tag("orders", rows.length === 0 ? "none" : "found");
  log.info(`found ${rows.length} orders`, { customerId });
  res.json(rows);
});

app.get("/orders/:id", (req, res) => {
  const id = Number(req.params.id);
  const sql = "SELECT id, customer_id AS customerId, product, amount, created_at AS createdAt FROM orders WHERE id = ?";
  const row = db.prepare(sql).get(id);
  if (!row) {
    res.status(404).json({ error: "order not found" });
    return;
  }
  res.json(row);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// 4. Record exceptions. Mount after the routes.
app.use(wizelens.errorMiddleware);

app.listen(PORT, () => {
  console.log(`orders-api on http://localhost:${PORT}  ·  dashboard http://localhost:${PORT}/_wizelens/`);
});
