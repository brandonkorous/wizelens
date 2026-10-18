// Moving to scale mode: copy every project's spans, logs, and metric points from Postgres into another store (ClickHouse).
import type { LogRecord, MetricPoint, Span } from "@wizeworks/lens-core";
import type { Db } from "../db/db.js";
import type { TelemetryStore } from "./store.js";

const PAGE = 500;

export interface CopyResult {
  traces: number;
  points: number;
}

/** One page of a project's traces, newest first, after the (start, id) cursor. */
async function tracePage(db: Db, projectId: string, after: [number, string] | null) {
  const cursor = after ? "AND (start_ms < $2 OR (start_ms = $2 AND trace_id > $3))" : "";
  return db.query<{ trace_id: string; start_ms: number; env: string }>(
    `SELECT trace_id, start_ms, env FROM traces WHERE project_id = $1 ${cursor} ORDER BY start_ms DESC, trace_id LIMIT ${PAGE}`,
    after ? [projectId, after[0], after[1]] : [projectId],
  );
}

async function partsOf(db: Db, projectId: string, ids: readonly string[]) {
  const spans = await db.query<{ trace_id: string; json: string }>("SELECT trace_id, json FROM spans WHERE project_id = $1 AND trace_id = ANY($2)", [projectId, [...ids]]);
  const logs = await db.query<{ trace_id: string; json: string }>("SELECT trace_id, json FROM logs WHERE project_id = $1 AND trace_id = ANY($2)", [projectId, [...ids]]);
  return { spans, logs };
}

/** Every trace of a project, written one trace at a time so each keeps its environment. */
async function copyTraces(db: Db, to: TelemetryStore, projectId: string, now: number): Promise<number> {
  let after: [number, string] | null = null;
  let n = 0;
  for (;;) {
    const page = await tracePage(db, projectId, after);
    if (!page.length) return n;
    const { spans, logs } = await partsOf(db, projectId, page.map((t) => t.trace_id));
    for (const t of page) {
      const s = spans.filter((r) => r.trace_id === t.trace_id).map((r) => JSON.parse(r.json) as Span);
      const l = logs.filter((r) => r.trace_id === t.trace_id).map((r) => ({ traceId: t.trace_id, log: JSON.parse(r.json) as LogRecord }));
      await to.write(projectId, { sender: { service: s[0]?.service ?? "copy", environment: t.env }, via: "addon", spans: s, logs: l, remotes: [] }, now);
    }
    n += page.length;
    after = [page[page.length - 1]!.start_ms, page[page.length - 1]!.trace_id];
  }
}

/** Every metric point of a project, oldest first, in batches of one environment, so counters and rates come out as at ingest. */
async function copyPoints(db: Db, to: TelemetryStore, projectId: string, now: number): Promise<number> {
  let n = 0;
  for (let offset = 0; ; offset += PAGE * 10) {
    const rows = await db.query<{ env: string; json: string }>(
      `SELECT env, json FROM metric_points WHERE project_id = $1 ORDER BY time_ms, series_key LIMIT ${PAGE * 10} OFFSET ${offset}`,
      [projectId],
    );
    if (!rows.length) return n;
    for (const env of [...new Set(rows.map((r) => r.env))]) {
      const metrics = rows.filter((r) => r.env === env).map((r) => JSON.parse(r.json) as MetricPoint);
      await to.write(projectId, { sender: { service: "copy", environment: env }, via: "otlp", spans: [], logs: [], remotes: [], metrics }, now);
    }
    n += rows.length;
  }
}

/** Copy everything (the target settles it later); projects the target has are skipped, else rollups count twice; `force` copies them too, after the switch. */
export async function copyTelemetry(db: Db, to: TelemetryStore, now: number, log: (line: string) => void = () => {}, force = false): Promise<CopyResult> {
  const out: CopyResult = { traces: 0, points: 0 };
  for (const { id } of await db.query<{ id: string }>("SELECT id FROM projects ORDER BY id")) {
    if (!force && (await to.counts(id)).traces > 0) {
      log(`  ${id}: already copied, skipped`);
      continue;
    }
    const traces = await copyTraces(db, to, id, now);
    const points = await copyPoints(db, to, id, now);
    log(`  ${id}: ${traces} traces, ${points} metric points`);
    out.traces += traces;
    out.points += points;
  }
  return out;
}
