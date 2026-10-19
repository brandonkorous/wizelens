// Ingest into ClickHouse: raw spans, logs, trace bounds, the update log, and metric points. Server-side async inserts batch the small writes.
import { createHash } from "node:crypto";
import { ATTR_BROWSER_SESSION, isLooseTraceId, logKey, seriesKeyOf, type Span } from "@wizeworks/lens-core";
import type { HubWrite } from "@wizeworks/lens-hub/kit";
import type { ChClient } from "./http.js";
import type { SettleQueue } from "./queue.js";
import { type Keep, logKeepOf, nextVer } from "./util.js";

/** Small batches from many add-ons: ClickHouse buffers them into one part, and answers once they are written. */
export const ASYNC = { async_insert: "1", wait_for_async_insert: "1" };

const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");

const sessionOf = (s: Span) => {
  const v = s.attributes[ATTR_BROWSER_SESSION];
  return typeof v === "string" && v ? v : null;
};

/** One bounds row per trace in the batch: its earliest start and latest end here. */
function headRows(w: HubWrite, projectId: string, now: number, keep: Keep) {
  const bounds = new Map<string, [number, number]>();
  const touch = (id: string, start: number, end: number) => {
    const b = bounds.get(id);
    bounds.set(id, b ? [Math.min(b[0], start), Math.max(b[1], end)] : [start, end]);
  };
  for (const s of w.spans) touch(s.traceId, s.startMs, s.startMs + s.durationMs);
  for (const { traceId, log } of w.logs) touch(traceId, log.timeMs, log.timeMs);
  const env = w.sender.environment ?? "";
  return [...bounds].map(([trace_id, [start, end]]) => ({ project_id: projectId, trace_id, start_ms: start, end_ms: end, updated_ms: now, env, expire_ms: start + (isLooseTraceId(trace_id) ? keep.logMs : keep.ms) }));
}

function spanRows(w: HubWrite, projectId: string, ver: number, expire: (ms: number) => number) {
  return w.spans.map((s) => ({
    project_id: projectId, trace_id: s.traceId, span_id: s.spanId, service: s.service, start_ms: s.startMs, duration_ms: s.durationMs,
    session: sessionOf(s), json: JSON.stringify(s), ver, expire_ms: expire(s.startMs),
  }));
}

function logRows(w: HubWrite, projectId: string, ver: number, keep: Keep) {
  return w.logs.map(({ traceId, log }) => ({
    project_id: projectId, trace_id: traceId, key: sha1(logKey(log)), time_ms: log.timeMs, json: JSON.stringify(log), ver, expire_ms: log.timeMs + logKeepOf(traceId, keep),
  }));
}

function pointRows(w: HubWrite, projectId: string, expire: (ms: number) => number) {
  const env = w.sender.environment ?? "";
  return (w.metrics ?? []).map((p) => ({
    project_id: projectId, time_ms: p.timeMs, env, service: p.service, name: p.name, series_key: sha1(seriesKeyOf(p)), json: JSON.stringify(p), expire_ms: expire(p.timeMs),
  }));
}

/** Save one batch's raw telemetry and queue its traces for settling. Metric rollups are written by the caller. */
export async function writeRaw(ch: ChClient, queue: SettleQueue, projectId: string, w: HubWrite, now: number, keep: Keep): Promise<void> {
  const expire = (ms: number) => ms + keep.ms;
  const ver = nextVer(now);
  const heads = headRows(w, projectId, now, keep);
  await Promise.all([
    ch.insert("spans_raw", spanRows(w, projectId, ver, expire), ASYNC),
    ch.insert("logs_raw", logRows(w, projectId, ver, keep), ASYNC),
    ch.insert("metric_points_raw", pointRows(w, projectId, expire), ASYNC),
  ]);
  // Bounds and the update log go last, so a settle never sees a trace before its parts.
  const updates = heads.map((h) => ({ project_id: h.project_id, trace_id: h.trace_id, updated_ms: now, env: h.env }));
  await Promise.all([ch.insert("trace_heads", heads, ASYNC), ch.insert("trace_updates", updates, ASYNC)]);
  for (const h of heads) queue.touch(projectId, h.trace_id, h.env, now);
}
