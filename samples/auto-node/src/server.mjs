// This app has no WizeLens code. Start it with `node --import @wizeworks/lens-node/auto` and it is traced.
import { DatabaseSync } from "node:sqlite";
import express from "express";

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL)");
const insert = db.prepare("INSERT INTO products (name, price) VALUES (?, ?)");
for (const [name, price] of [["Keyboard", 49], ["Mouse", 19], ["Monitor", 229], ["Dock", 129]]) insert.run(name, price);

const app = express();

app.get("/api/products", (_req, res) => {
  console.log("listing products");
  res.json(db.prepare("SELECT * FROM products ORDER BY id").all());
});

// Deliberate N+1: one query for the ids, then one query per product.
app.get("/api/products/:id/related", (req, res) => {
  const ids = db.prepare("SELECT id FROM products WHERE id <> ?").all(Number(req.params.id));
  res.json(ids.map(({ id }) => db.prepare("SELECT * FROM products WHERE id = ?").get(id)));
});

// An outgoing call: the fetch span joins this request's trace.
app.get("/api/catalog", async (req, res) => {
  const products = await (await fetch(`http://${req.headers.host}/api/products`)).json();
  res.json({ count: products.length, products });
});

app.get("/api/boom", () => {
  throw new Error("Boom! Thrown on purpose to test the auto install.");
});

const server = app.listen(Number(process.env.PORT ?? 5300), () => {
  console.log(`sample-auto-node listening on http://localhost:${server.address().port}`);
});
