// SLOs and Apdex targets on the hub, per project ("" for all): `api/slos` and `api/apdex`.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { type ApdexTargets, parseApdexTargets, parseSlo, type Slo, sloReport } from "@wizeworks/lens-core/internal";
import { sendJson } from "@wizeworks/lens-node/internal";
import { parseJson, readBody } from "./body.js";
import { hubExecutor } from "./scale-exec.js";
import type { HubStore } from "./store.js";

/** Bumps when Apdex targets change, so cached page models are not reused. */
let apdexGen = 0;
export const apdexVersion = (): number => apdexGen;

const slosOf = (rows: unknown[]): Slo[] => (rows as { json: string }[]).map((r) => JSON.parse(r.json) as Slo);

export const listSlos = (db: DatabaseSync, project: string): Slo[] => slosOf(db.prepare("SELECT json FROM slos WHERE project = ? ORDER BY created_ms").all(project));

export const sloById = (db: DatabaseSync, project: string, id: string): Slo | undefined => slosOf(db.prepare("SELECT json FROM slos WHERE project = ? AND id = ?").all(project, id))[0];

function saveSlo(db: DatabaseSync, s: Slo, now: number): void {
  db.prepare("INSERT INTO slos (id, project, json, created_ms) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json").run(s.id, s.projectId, JSON.stringify(s), now);
}

/** A project's Apdex targets (service to ms). */
export function apdexTargets(db: DatabaseSync, project: string): ApdexTargets {
  const row = db.prepare("SELECT json FROM apdex_targets WHERE project = ?").get(project) as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as ApdexTargets) : {};
}

const body = async (req: IncomingMessage): Promise<Record<string, unknown>> => (parseJson(await readBody(req)) ?? {}) as Record<string, unknown>;

/** `GET api/apdex?project=`: the targets. `PUT`: replace them with `{ apdex: { service: ms } }`. */
export async function handleApdex(db: DatabaseSync, method: string, project: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (method === "GET") return sendJson(res, 200, { apdex: apdexTargets(db, project) });
  if (method !== "PUT") return sendJson(res, 405, { error: "method not allowed" });
  const t = parseApdexTargets((await body(req)).apdex);
  if (typeof t === "string") return sendJson(res, 400, { error: t });
  db.prepare("INSERT INTO apdex_targets (project, json) VALUES (?, ?) ON CONFLICT (project) DO UPDATE SET json = excluded.json").run(project, JSON.stringify(t));
  apdexGen++;
  sendJson(res, 200, { apdex: t });
}

async function onSlo(store: HubStore, method: string, project: string, id: string, req: IncomingMessage, res: ServerResponse, now: number): Promise<void> {
  const db = store.db;
  const slo = sloById(db, project, id);
  if (!slo) return sendJson(res, 404, { error: "SLO not found." });
  if (method === "GET") return sendJson(res, 200, await sloReport(slo, hubExecutor(store, { project: project || undefined }), now));
  if (method === "DELETE") return (db.prepare("DELETE FROM slos WHERE id = ?").run(id), sendJson(res, 200, { ok: true }));
  if (method !== "PATCH") return sendJson(res, 405, { error: "method not allowed" });
  const input = parseSlo({ ...slo, ...(await body(req)) });
  if (typeof input === "string") return sendJson(res, 400, { error: input });
  const next = { ...slo, ...input };
  saveSlo(db, next, now);
  sendJson(res, 200, next);
}

/** `api/slos?project=`: list (with reports) and create; `api/slos/:id`: one report, change, delete. */
export async function handleSlos(store: HubStore, sub: string, req: IncomingMessage, res: ServerResponse, url: URL, now: number): Promise<void> {
  const method = req.method ?? "GET";
  const project = url.searchParams.get("project") ?? "";
  const id = sub.split("/")[2];
  if (id) return onSlo(store, method, project, decodeURIComponent(id), req, res, now);
  if (method === "GET") {
    const ex = hubExecutor(store, { project: project || undefined });
    return sendJson(res, 200, { slos: await Promise.all(listSlos(store.db, project).map((s) => sloReport(s, ex, now))), apdex: apdexTargets(store.db, project) });
  }
  if (method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
  const input = parseSlo(await body(req));
  if (typeof input === "string") return sendJson(res, 400, { error: input });
  const slo: Slo = { ...input, id: randomUUID(), projectId: project };
  saveSlo(store.db, slo, now);
  sendJson(res, 201, slo);
}
