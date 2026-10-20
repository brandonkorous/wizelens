import { afterAll, describe, expect, it } from "vitest";
import { pageContext, runPage, type Trace, windowOf } from "@wizeworks/lens-core";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import { createProject } from "./repo/projects.js";
import { pgReader, pgTelemetry } from "./telemetry/pg-store.js";
import { type TelemetryStore, type TenantScope, tenantScope } from "./telemetry/store.js";
import { chClient } from "./telemetry/ch/http.js";
import { readerClient, readerOf } from "./telemetry/ch/reader.js";
import { CH_LIMIT, type ChTest, CH_URL, chTest } from "./test/ch.js";
import { seedOrg, testDb } from "./test/db.js";

const traces = scenarioTraces().slice(0, 12);
const DAY = 86_400_000;

async function write(store: TelemetryStore, projectId: string, list: readonly Trace[]): Promise<void> {
  for (const t of list) {
    const logs = t.logs.map((log) => ({ traceId: t.traceId, log }));
    await store.write(projectId, { sender: { service: "api", environment: "prod" }, via: "addon", spans: t.spans, logs, remotes: [] }, SCENARIO_NOW);
  }
}

/** Requests on the overview, spans found by search, and traces counted, for one scope. */
async function seen(store: TelemetryStore, scope: TenantScope) {
  const overview = await runPage("overview", pageContext("30d", SCENARIO_NOW, {}), store.executor(scope, 1000 * DAY));
  const spans = await store.search(scope, { kind: "spans", node: null, window: windowOf("30d", SCENARIO_NOW), limit: 1000 });
  return { requests: overview.headlines.total.value ?? 0, spans: spans.items.length, traces: (await store.counts(scope)).traces };
}

/** Org A has projects a1 (all traces) and a2 (half); org B has b1 (all traces again). */
async function checkScopes(store: TelemetryStore, ids: { orgA: string; orgB: string; a1: string; a2: string; b1: string }): Promise<void> {
  const one = await seen(store, tenantScope(ids.orgA, [ids.a1]));
  const half = await seen(store, tenantScope(ids.orgA, [ids.a2]));
  const both = await seen(store, tenantScope(ids.orgA, [ids.a1, ids.a2]));
  expect(one.requests).toBeGreaterThan(0);
  expect(both.requests).toBe(one.requests + half.requests);
  expect(both.spans).toBe(one.spans + half.spans);
  expect(both.traces).toBe(one.traces);
  // Org B's project named under org A reads nothing, though it holds the same traces.
  expect(await seen(store, tenantScope(ids.orgA, [ids.b1]))).toEqual({ requests: 0, spans: 0, traces: 0 });
  expect(await seen(store, tenantScope(ids.orgB, [ids.b1]))).toEqual(one);
}

describe("Read scopes", () => {
  it("refuse an empty organization or project list", () => {
    expect(() => tenantScope("", ["p"])).toThrow(/organization/);
    expect(() => tenantScope("o", [])).toThrow(/project/);
    expect(tenantScope("o", ["p", "p"]).projects).toEqual(["p"]);
  });

  it("read many projects of one organization on Postgres, and never another organization's", async () => {
    const db = await testDb();
    const [orgA, orgB] = [(await seedOrg(db, "A")).orgId, (await seedOrg(db, "B")).orgId];
    const [a1, a2, b1] = [(await createProject(db, orgA, "One", 1)).id, (await createProject(db, orgA, "Two", 1)).id, (await createProject(db, orgB, "Other", 1)).id];
    const store = pgTelemetry(db);
    await write(store, a1, traces);
    await write(store, a2, traces.slice(0, 6));
    await write(store, b1, traces);
    await store.settle(SCENARIO_NOW + 60_000, { budgetMs: Number.POSITIVE_INFINITY });
    await checkScopes(store, { orgA, orgB, a1, a2, b1 });
    // The database holds the reader to its organization even when the SQL names none.
    const count = async (org: string) => (await pgReader(db, org).query<{ n: number }>("SELECT count(*)::int AS n FROM spans"))[0]!.n;
    const [all] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM spans");
    expect((await count(orgA)) + (await count(orgB))).toBe(all!.n);
    expect(await count(orgB)).toBeGreaterThan(0);
    expect(await count("nobody")).toBe(0);
  }, 60_000);
});

const opened: ChTest[] = [];
afterAll(async () => {
  for (const t of opened) await t.store.close();
  await Promise.all(opened.map((t) => t.drop()));
});

describe.skipIf(!CH_URL)("Read scopes on ClickHouse", () => {
  it("read many projects of one organization, and never another organization's", async () => {
    const orgs: Record<string, string> = { a1: "org-a", a2: "org-a", b1: "org-b" };
    const t = await chTest(1000, SCENARIO_NOW, { orgOf: async (ids) => new Map(ids.map((id) => [id, orgs[id]!])) });
    opened.push(t);
    await write(t.store, "a1", traces);
    await write(t.store, "a2", traces.slice(0, 6));
    await write(t.store, "b1", traces);
    await t.store.settle(SCENARIO_NOW + 60_000, { budgetMs: Number.POSITIVE_INFINITY });
    await checkScopes(t.store, { orgA: "org-a", orgB: "org-b", a1: "a1", a2: "a2", b1: "b1" });
    // The database holds the reader to its organization even when the SQL names none.
    const reader = readerOf(t.url);
    const count = (org: string) => readerClient(reader, org).query<{ n: string }>("SELECT count() AS n FROM spans_raw WHERE has(['a1', 'b1'], project_id)");
    const [a, b] = [Number((await count("org-a"))[0]!.n), Number((await count("org-b"))[0]!.n)];
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
    expect(Number((await count("org-none"))[0]!.n)).toBe(0);
    await expect(chClient({ url: reader.url }).query("SELECT count() FROM fact_requests")).rejects.toThrow();
    await expect(chClient({ url: reader.url }).query("SELECT count() FROM trace_updates")).rejects.toThrow();
  }, CH_LIMIT);
});
