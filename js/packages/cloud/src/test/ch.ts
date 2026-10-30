// ClickHouse test stores: each gets its own database, dropped afterwards. Set WIZELENS_TEST_CLICKHOUSE (http://user:pass@host:8123) to run them.
import type { Trace } from "@wizeworks/lens-core/internal";
import { SCENARIO_NOW } from "../../../core/src/testing/scenario.js";
import { chClient } from "../telemetry/ch/http.js";
import { type ChStoreOptions, openClickHouse } from "../telemetry/ch/store.js";
import { type TelemetryStore, type TenantScope, tenantScope } from "../telemetry/store.js";

export const CH_URL = process.env.WIZELENS_TEST_CLICKHOUSE ?? "";
// One shared ClickHouse on a busy CI runner can take twice as long as usual, so its tests share one wide limit.
export const CH_LIMIT = 600_000;
const DAY = 86_400_000;

/** Tests' projects all belong to one organization. */
export const TEST_ORG = "org-ch";
export const testOrgOf = async (ids: readonly string[]) => new Map(ids.map((id) => [id, TEST_ORG]));

/** A test project's read scope. */
export const chScope = (projectId: string): TenantScope => tenantScope(TEST_ORG, [projectId]);

export interface ChTest {
  store: TelemetryStore;
  projectId: string;
  /** The project's read scope. */
  scope: TenantScope;
  retentionMs: number;
  /** The test database's URL, for direct reads. */
  url: string;
  drop(): Promise<void>;
}

/** A fresh database with one project, kept `days` days. The default outlives the fixed test clock, so TTLs keep the rows. */
export async function chTest(days = 1000, now = SCENARIO_NOW, extra: Partial<ChStoreOptions> = {}): Promise<ChTest> {
  const name = `wl_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const url = `${CH_URL.replace(/\/$/, "")}/${name}`;
  const store = await openClickHouse({ url, retentionOf: async (ids) => new Map(ids.map((id) => [id, days])), orgOf: testOrgOf, defaultRetentionDays: days, now: () => now, ttl: false, ...extra });
  const drop = async () => {
    const u = new URL(url);
    u.pathname = "/default";
    await chClient({ url: u.toString() }).command(`DROP DATABASE IF EXISTS ${name}`);
  };
  return { store, projectId: "proj-ch", scope: chScope("proj-ch"), retentionMs: days * DAY, url, drop };
}

/** Write traces through the store's normal write path, one batch per trace. */
export async function chWrite(t: ChTest, traces: readonly Trace[], now = SCENARIO_NOW): Promise<void> {
  for (const tr of traces) {
    const w = { sender: { service: "api", environment: "prod" }, via: "addon" as const, spans: tr.spans, logs: tr.logs.map((log) => ({ traceId: tr.traceId, log })), remotes: [] };
    await t.store.write(t.projectId, w, now);
  }
}

export const chSettle = (t: ChTest, now = SCENARIO_NOW + 10_000) => t.store.settle(now, { budgetMs: Number.POSITIVE_INFINITY });
