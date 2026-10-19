// An Express app with no WizeLens code. The auto install traces it.
import { DatabaseSync } from "node:sqlite";
import express from "express";

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE orders (id INTEGER PRIMARY KEY, total REAL)");
db.prepare("INSERT INTO orders (total) VALUES (?)").run(12.5);

const app = express();
app.get("/orders/:id", (req, res) => {
  console.log("loading order", req.params.id);
  res.json(db.prepare("SELECT * FROM orders WHERE id = ?").get(Number(req.params.id)) ?? null);
});
app.get("/boom", () => {
  throw new Error("express boom");
});
const server = app.listen(0, () => console.log(`ready ${server.address().port}`));
