// SLOs and Apdex targets per project.
import type { ApdexTargets, Slo, SloInput } from "@wizeworks/lens-core";
import { newId } from "../auth/crypto.js";
import type { Queryable } from "../db/db.js";

const COLUMNS = `id, project_id AS "projectId", name, service, endpoint, kind, target, threshold_ms AS "thresholdMs", window_days AS "windowDays"`;
const toSlo = (r: Slo): Slo => ({ ...r, target: Number(r.target), thresholdMs: Number(r.thresholdMs), windowDays: Number(r.windowDays) as Slo["windowDays"] });

export const listSlos = async (q: Queryable, projectId: string): Promise<Slo[]> =>
  (await q.query<Slo>(`SELECT ${COLUMNS} FROM slos WHERE project_id = $1 ORDER BY created_ms`, [projectId])).map(toSlo);

export async function sloById(q: Queryable, projectId: string, id: string): Promise<Slo | undefined> {
  const [row] = await q.query<Slo>(`SELECT ${COLUMNS} FROM slos WHERE project_id = $1 AND id = $2`, [projectId, id]);
  return row && toSlo(row);
}

export async function createSlo(q: Queryable, projectId: string, s: SloInput, by: string, now: number): Promise<string> {
  const id = newId();
  await q.query(
    `INSERT INTO slos (id, project_id, name, service, endpoint, kind, target, threshold_ms, window_days, created_by, created_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, projectId, s.name, s.service, s.endpoint, s.kind, s.target, s.thresholdMs, s.windowDays, by, now],
  );
  return id;
}

export async function updateSlo(q: Queryable, projectId: string, id: string, s: SloInput): Promise<void> {
  await q.query(
    `UPDATE slos SET name = $3, service = $4, endpoint = $5, kind = $6, target = $7, threshold_ms = $8, window_days = $9 WHERE project_id = $1 AND id = $2`,
    [projectId, id, s.name, s.service, s.endpoint, s.kind, s.target, s.thresholdMs, s.windowDays],
  );
}

export async function deleteSlo(q: Queryable, projectId: string, id: string): Promise<boolean> {
  return (await q.query("DELETE FROM slos WHERE project_id = $1 AND id = $2 RETURNING id", [projectId, id])).length > 0;
}

export async function apdexTargets(q: Queryable, projectId: string): Promise<ApdexTargets> {
  const [row] = await q.query<{ targets: string }>("SELECT targets FROM apdex_targets WHERE project_id = $1", [projectId]);
  return row ? (JSON.parse(row.targets) as ApdexTargets) : {};
}

export async function saveApdexTargets(q: Queryable, projectId: string, t: ApdexTargets): Promise<void> {
  await q.query("INSERT INTO apdex_targets (project_id, targets) VALUES ($1, $2) ON CONFLICT (project_id) DO UPDATE SET targets = $2", [projectId, JSON.stringify(t)]);
}
