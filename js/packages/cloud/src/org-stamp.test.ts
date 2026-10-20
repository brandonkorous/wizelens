import { afterAll, describe, expect, it } from "vitest";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { metricScenario } from "../../core/src/testing/metric-scenario.js";
import { ORG_TABLES as PG_TABLES } from "./db/schema-orgs.js";
import { chClient } from "./telemetry/ch/http.js";
import { stampOrgs } from "./telemetry/ch/admin.js";
import { ORG_TABLES as CH_TABLES } from "./telemetry/ch/schema.js";
import { pgTelemetry } from "./telemetry/pg-store.js";
import type { TelemetryStore } from "./telemetry/store.js";
import { CH_LIMIT, CH_URL, type ChTest, chTest, TEST_ORG } from "./test/ch.js";
import { seedOrg, testDb } from "./test/db.js";

/** Traces, log lines, and metric points of one project, then settled, so every telemetry table has rows. */
async function fill(store: TelemetryStore, projectId: string): Promise<void> {
  for (const tr of scenarioTraces().slice(0, 20)) {
    const logs = tr.logs.map((log) => ({ traceId: tr.traceId, log }));
    await store.write(projectId, { sender: { service: "api", environment: "prod" }, via: "addon", spans: tr.spans, logs, remotes: [] }, SCENARIO_NOW);
  }
  const metrics = metricScenario("1h", SCENARIO_NOW).slice(0, 50);
  await store.write(projectId, { sender: { service: "api", environment: "prod" }, via: "otlp", spans: [], logs: [], remotes: [], metrics }, SCENARIO_NOW);
  await store.settle(SCENARIO_NOW + 60_000, { budgetMs: Number.POSITIVE_INFINITY });
}

describe("Every Postgres telemetry row names its organization", () => {
  it("stamps the project's organization on every insert", async () => {
    const db = await testDb();
    const { orgId } = await seedOrg(db);
    await db.query("INSERT INTO projects (id, org_id, name, slug, created_ms) VALUES ('p1', $1, 'Shop', 'shop', 0)", [orgId]);
    await db.query("INSERT INTO services (project_id, service, environment, host, via, info, first_seen, last_seen) VALUES ('p1', 'api', 'prod', 'h1', 'addon', '{}', 0, 0)");
    await fill(pgTelemetry(db), "p1");
    for (const t of PG_TABLES) {
      const [row] = await db.query<{ n: number; wrong: number }>(`SELECT count(*)::int AS n, count(*) FILTER (WHERE org_id <> $1)::int AS wrong FROM ${t}`, [orgId]);
      expect({ t, wrong: row!.wrong }).toEqual({ t, wrong: 0 });
    }
    const [spans] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM spans WHERE org_id = $1", [orgId]);
    expect(spans!.n).toBeGreaterThan(0);
  });
});

const opened: ChTest[] = [];
afterAll(async () => {
  for (const t of opened) await t.store.close();
  await Promise.all(opened.map((t) => t.drop()));
});

describe.skipIf(!CH_URL)("Every ClickHouse telemetry row names its organization", () => {
  it("writes the organization on raw rows, facts, rollups, and metrics", async () => {
    const t = await chTest();
    opened.push(t);
    await fill(t.store, t.projectId);
    const ch = chClient({ url: t.url });
    for (const table of CH_TABLES) {
      const [row] = await ch.query<{ wrong: string }>(`SELECT countIf(org_id != {p1:String}) AS wrong FROM ${table}`, [TEST_ORG]);
      expect({ table, wrong: Number(row!.wrong) }).toEqual({ table, wrong: 0 });
    }
    const [facts] = await ch.query<{ n: string }>("SELECT count() AS n FROM fact_requests WHERE org_id = {p1:String}", [TEST_ORG]);
    expect(Number(facts!.n)).toBeGreaterThan(0);
  }, CH_LIMIT);

  it("stamps rows written without one, and leaves deleted projects' rows empty", async () => {
    const t = await chTest();
    opened.push(t);
    const ch = chClient({ url: t.url });
    const row = (project: string) => ({ project_id: project, trace_id: "t1", span_id: "s1", service: "api", start_ms: SCENARIO_NOW, duration_ms: 1, json: "{}", ver: 1, expire_ms: SCENARIO_NOW * 2 });
    await ch.insert("spans_raw", [row("kept"), row("gone")]);
    await stampOrgs(ch, async (ids) => new Map(ids.filter((id) => id === "kept").map((id) => [id, "org-a"])));
    const rows = await ch.query<{ project_id: string; org_id: string }>("SELECT project_id, org_id FROM spans_raw ORDER BY project_id");
    expect(rows).toEqual([{ project_id: "gone", org_id: "" }, { project_id: "kept", org_id: "org-a" }]);
  }, CH_LIMIT);
});
