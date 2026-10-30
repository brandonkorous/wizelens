import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { logSearchOf } from "@wizeworks/lens-core/internal";
import { listSaved } from "./saved.js";
import { HUB_SCHEMA } from "./schema.js";
import { upgradeHubSchema } from "./schema-scale.js";

const OLD_TABLE = `CREATE TABLE saved_searches (
  id TEXT PRIMARY KEY, project TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, name TEXT NOT NULL, params TEXT NOT NULL, created_ms REAL NOT NULL
)`;

it("moves the old saved log searches into the saved store as charted searches, then drops their table", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(HUB_SCHEMA);
  db.exec(OLD_TABLE);
  const add = db.prepare("INSERT INTO saved_searches (id, project, kind, name, params, created_ms) VALUES (?, ?, 'logs', ?, ?, ?)");
  add.run("a", "shop", "Timeouts", JSON.stringify({ level: "error", q: "timeout & retry=2 #5" }), 1000);
  add.run("b", "", "Everything", "{}", 2000);
  upgradeHubSchema(db);
  const [moved] = listSaved(db, "shop");
  expect(moved).toMatchObject({ id: "a", projectId: "shop", kind: "search", name: "Timeouts", chart: true, shared: true, createdMs: 1000 });
  expect(logSearchOf(moved!.href)).toEqual({ level: "error", q: "timeout & retry=2 #5" });
  expect(listSaved(db, "")).toMatchObject([{ id: "b", href: "#/logs", chart: true }]);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'saved_searches'").get()).toBeUndefined();
  expect(db.prepare("SELECT value FROM meta WHERE key = 'schema'").get()).toEqual({ value: "5" });
  upgradeHubSchema(db);
  expect(listSaved(db, "shop")).toHaveLength(1);
  db.close();
});
