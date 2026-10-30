import { type Executor, memoryExecutor, pageContext, type TimeRange, type Trace } from "@wizeworks/lens-core/internal";
import { compareResults } from "../../../core/src/testing/scale-compare.js";
import { parityNeeds } from "../../../core/src/testing/scale-needs.js";
import { SCENARIO_NOW } from "../../../core/src/testing/scenario.js";
import type { Db } from "../db/db.js";
import { createProject } from "../repo/projects.js";
import { writeBatch } from "../repo/trace-write.js";
import { cloudExecutor } from "../scale-exec.js";
import { settleCloud } from "../settle.js";
import { tenantScope } from "../telemetry/store.js";
import { seedOrg, testDb } from "./db.js";

export const DAY = 86_400_000;
export const RANGES: TimeRange[] = ["15m", "1h", "6h", "24h", "7d", "30d"];

export interface ScaleDb {
  db: Db;
  projectId: string;
  orgId: string;
  retentionMs: number;
  ex: Executor;
}

/** A database with one organization (retention in days) and one project. */
export async function scaleDb(retentionDays = 90): Promise<ScaleDb> {
  const db = await testDb();
  const { orgId } = await seedOrg(db, "Scale", retentionDays);
  const projectId = (await createProject(db, orgId, "Shop", 1)).id;
  return { db, projectId, orgId, retentionMs: retentionDays * DAY, ex: cloudExecutor(db, tenantScope(orgId, [projectId]), retentionDays * DAY) };
}

/** Write traces through the cloud's normal write path, one batch per trace. */
export async function writeTraces(s: ScaleDb, traces: readonly Trace[], now = SCENARIO_NOW): Promise<void> {
  for (const t of traces) {
    const w = { sender: { service: "api", environment: "prod" }, via: "addon" as const, spans: t.spans, logs: t.logs.map((log) => ({ traceId: t.traceId, log })), remotes: [] };
    await s.db.tx((q) => writeBatch(q, s.projectId, w, now));
  }
}

/** Write many traces fast: up to `size` traces per batch, as a busy sender does. */
export async function writeChunked(db: Db, projectId: string, traces: readonly Trace[], now: number, size = 100): Promise<void> {
  for (let i = 0; i < traces.length; i += size) {
    const part = traces.slice(i, i + size);
    const w = { sender: { service: "api", environment: "prod" }, via: "addon" as const, spans: part.flatMap((t) => t.spans), logs: part.flatMap((t) => t.logs.map((log) => ({ traceId: t.traceId, log }))), remotes: [] };
    await db.tx((q) => writeBatch(q, projectId, w, now));
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
