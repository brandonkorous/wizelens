import { type Executor, memoryExecutor, pageContext, type TimeRange, type Trace } from "@wizeworks/lens-core";
import { compareResults } from "../../../core/src/testing/scale-compare.js";
import { parityNeeds } from "../../../core/src/testing/scale-needs.js";
import { SCENARIO_NOW } from "../../../core/src/testing/scenario.js";
import type { Db } from "../db/db.js";
import { createOrg } from "../repo/orgs.js";
import { createProject } from "../repo/projects.js";
import { writeBatch } from "../repo/trace-write.js";
import { createUser } from "../repo/users.js";
import { cloudExecutor } from "../scale-exec.js";
import { settleCloud } from "../settle.js";
import { testDb } from "./db.js";

export const DAY = 86_400_000;
export const RANGES: TimeRange[] = ["15m", "1h", "6h", "24h", "7d", "30d"];

export interface ScaleDb {
  db: Db;
  projectId: string;
  retentionMs: number;
  ex: Executor;
}

/** A database with one organization (retention in days) and one project. */
export async function scaleDb(retentionDays = 90): Promise<ScaleDb> {
  const db = await testDb();
  const owner = await createUser(db, `o${Math.random()}@x.io`, "long enough pw", "Owner", 1);
  const org = await createOrg(db, "Scale", owner.id, 1, retentionDays);
  const projectId = (await createProject(db, org.id, "Shop", 1)).id;
  return { db, projectId, retentionMs: retentionDays * DAY, ex: cloudExecutor(db, projectId, retentionDays * DAY) };
}

/** Write traces through the cloud's normal write path, one batch per trace. */
export async function writeTraces(s: ScaleDb, traces: readonly Trace[], now = SCENARIO_NOW): Promise<void> {
  for (const t of traces) {
    const w = { sender: { service: "api", environment: "prod" }, via: "addon" as const, spans: t.spans, logs: t.logs.map((log) => ({ traceId: t.traceId, log })), remotes: [] };
    await s.db.tx((q) => writeBatch(q, s.projectId, w, now));
  }
}

/** Settle everything once the quiet period has passed. */
export const settleAll = (s: ScaleDb, now = SCENARIO_NOW + 10_000) => settleCloud(s.db, now, { budgetMs: Infinity });

/** SQL results against memory results over `traces`, for every parity need and range. */
export async function parity(s: ScaleDb, traces: readonly Trace[], ranges: readonly TimeRange[] = RANGES, skip?: ReadonlySet<string>): Promise<string[]> {
  const mem = memoryExecutor(traces);
  const out: string[] = [];
  for (const range of ranges) {
    const ctx = pageContext(range, SCENARIO_NOW, {});
    const needs = parityNeeds(ctx, mem);
    const diffs = compareResults(await s.ex.run(needs, ctx), mem.runSync(needs, ctx), needs, { ctx, facts: mem.facts(), retentionMs: s.retentionMs, skip });
    out.push(...diffs.map((d) => `${range} ${d}`));
  }
  return out;
}
