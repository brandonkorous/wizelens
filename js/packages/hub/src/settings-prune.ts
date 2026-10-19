// Pruning for projects that keep data for less time than the hub: their traces go with the rest, their other rows here.
import type { DatabaseSync } from "node:sqlite";
import { tierByName, tierCutoff } from "@wizeworks/lens-core";
import { allSettings, keepMsOf } from "./settings.js";

/** Projects that keep data for less time than the hub, with how long. */
export function shorterKeeps(h: { db: DatabaseSync; maxAgeMs: number }): { project: string; keepMs: number }[] {
  return [...allSettings(h.db).keys()].map((project) => ({ project, keepMs: keepMsOf(h, project) })).filter((s) => s.keepMs < h.maxAgeMs);
}

/** In the prune transaction: a project's metric points, 1 h stat and metric buckets, and series past its keep. */
export function pruneProjectRows(db: DatabaseSync, project: string, now: number, keepMs: number): void {
  db.prepare("DELETE FROM metrics WHERE project = ? AND time_ms < ?").run(project, now - keepMs);
  const edge = tierCutoff(tierByName("1h"), now, keepMs);
  for (const t of ["rollup_1h", "hist_1h", "metric_1h"]) db.prepare(`DELETE FROM ${t} WHERE project = ? AND bucket_ms <= ?`).run(project, edge);
  db.prepare("DELETE FROM metric_series WHERE project = ? AND last_ms < ?").run(project, now - keepMs);
}
