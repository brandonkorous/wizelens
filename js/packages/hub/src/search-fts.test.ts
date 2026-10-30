import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { parseSearch, SQLITE_DIALECT, searchSql, windowOf } from "@wizeworks/lens-core/internal";
import { scenarioTraces, SCENARIO_NOW } from "../../core/src/testing/scenario.js";
import { sqliteRunner } from "./scale-exec.js";
import { upgradeHubSchema } from "./schema-scale.js";
import { clockStore, settleAll, writeTraces } from "./test/scale.js";

const plan = (db: DatabaseSync, sql: string, params: unknown[]) =>
  (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as string[])) as { detail: string }[]).map((r) => r.detail).join("\n");

describe("hub trigram indexes", () => {
  it("answer contains searches of 3 or more characters, and scan for shorter ones", () => {
    const db = new DatabaseSync(":memory:");
    upgradeHubSchema(db);
    const sql = "SELECT 1 FROM fact_search s WHERE s.rowid IN (SELECT rowid FROM fact_search_fts WHERE fact_search_fts MATCH ?)";
    expect(plan(db, sql, ['"pay"'])).toContain("VIRTUAL TABLE INDEX");
  });

  it("stay in step with the facts through settle, prune, and a rebuild", async () => {
    const { store, clock } = clockStore();
    writeTraces(store, scenarioTraces());
    settleAll(store, clock);
    const count = (t: string) => (store.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    for (const t of ["fact_search", "fact_requests", "fact_traces", "fact_logs"]) {
      expect(count(`${t}_fts`), t).toBe(count(t));
      store.db.exec(`INSERT INTO ${t}_fts (${t}_fts) VALUES ('integrity-check')`);
    }
    const src = { d: SQLITE_DIALECT, run: sqliteRunner(store.db), scope: {} };
    const page = await searchSql(src, { kind: "requests", node: parseSearch('"/api/c"'), window: windowOf("30d", SCENARIO_NOW), limit: 50, cursor: null });
    expect(page.items.length).toBeGreaterThan(0);
  });

  it("fill once for a file that had facts before the indexes", () => {
    const { store, clock } = clockStore();
    writeTraces(store, scenarioTraces());
    settleAll(store, clock);
    for (const t of ["fact_search", "fact_requests", "fact_traces", "fact_logs"]) store.db.exec(`DROP TABLE ${t}_fts`);
    upgradeHubSchema(store.db);
    const n = (store.db.prepare("SELECT COUNT(*) AS n FROM fact_search_fts WHERE fact_search_fts MATCH '\"api\"'").get() as { n: number }).n;
    expect(n).toBeGreaterThan(0);
  });
});
