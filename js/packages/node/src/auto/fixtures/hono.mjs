// A Hono app on @hono/node-server with node:sqlite, and no WizeLens code.
import { DatabaseSync } from "node:sqlite";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
db.prepare("INSERT INTO users (name) VALUES (?)").run("ada");

const app = new Hono();
app.get("/users/:id", (c) => c.json(db.prepare("SELECT * FROM users WHERE id = ?").get(Number(c.req.param("id"))) ?? null));
app.get("/boom", () => {
  throw new Error("hono boom");
});
serve({ fetch: app.fetch, port: 0 }, (info) => console.log(`ready ${info.port}`));
