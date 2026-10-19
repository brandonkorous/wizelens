// A Fastify app with pino and better-sqlite3, and no WizeLens code.
import Database from "better-sqlite3";
import Fastify from "fastify";

const db = new Database(":memory:");
db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
db.prepare("INSERT INTO items (name) VALUES (?)").run("lamp");

const app = Fastify({ logger: { level: "info" } });
app.get("/items/:id", async (request) => {
  request.log.info("reading item");
  return db.prepare("SELECT * FROM items WHERE id = ?").get(Number(request.params.id)) ?? null;
});
app.get("/boom", async () => {
  throw new Error("fastify boom");
});
await app.listen({ port: 0, host: "127.0.0.1" });
console.log(`ready ${app.server.address().port}`);
