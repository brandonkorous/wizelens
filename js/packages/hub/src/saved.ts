// Saved views, searches, and dashboards on the hub: `api/saved?project=`. The hub has no accounts, so every item is shared.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { parseSaved, type SavedItem } from "@wizeworks/lens-core";
import { sendJson } from "@wizeworks/lens-node/kit";
import { parseJson, readBody } from "./body.js";

const itemsOf = (rows: unknown[]): SavedItem[] => (rows as { json: string }[]).map((r) => JSON.parse(r.json) as SavedItem);

export const listSaved = (db: DatabaseSync, project: string): SavedItem[] => itemsOf(db.prepare("SELECT json FROM saved WHERE project = ? ORDER BY created_ms").all(project));

const savedById = (db: DatabaseSync, project: string, id: string): SavedItem | undefined => itemsOf(db.prepare("SELECT json FROM saved WHERE project = ? AND id = ?").all(project, id))[0];

function save(db: DatabaseSync, item: SavedItem): void {
  db.prepare("INSERT INTO saved (id, project, kind, json, created_ms) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json").run(item.id, item.projectId, item.kind, JSON.stringify(item), item.createdMs);
}

const body = async (req: IncomingMessage): Promise<Record<string, unknown>> => (parseJson(await readBody(req)) ?? {}) as Record<string, unknown>;

async function onItem(db: DatabaseSync, method: string, project: string, id: string, req: IncomingMessage, res: ServerResponse, now: number): Promise<void> {
  const item = savedById(db, project, id);
  if (!item) return sendJson(res, 404, { error: "Not found." });
  if (method === "GET") return sendJson(res, 200, item);
  if (method === "DELETE") return (db.prepare("DELETE FROM saved WHERE id = ?").run(id), sendJson(res, 200, { ok: true }));
  if (method !== "PATCH") return sendJson(res, 405, { error: "method not allowed" });
  const input = parseSaved({ ...item, ...(await body(req)), kind: item.kind });
  if (typeof input === "string") return sendJson(res, 400, { error: input });
  const next: SavedItem = { ...item, ...input, shared: true, updatedMs: now };
  save(db, next);
  sendJson(res, 200, next);
}

/** `api/saved?project=` lists and adds; `api/saved/:id` reads, changes, and deletes. */
export async function handleSaved(db: DatabaseSync, sub: string, req: IncomingMessage, res: ServerResponse, url: URL, now: number): Promise<void> {
  const method = req.method ?? "GET";
  const project = url.searchParams.get("project") ?? "";
  const id = sub.split("/")[2];
  if (id) return onItem(db, method, project, decodeURIComponent(id), req, res, now);
  if (method === "GET") return sendJson(res, 200, { items: listSaved(db, project) });
  if (method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
  const input = parseSaved(await body(req));
  if (typeof input === "string") return sendJson(res, 400, { error: input });
  const item: SavedItem = { ...input, id: randomUUID(), projectId: project, shared: true, owner: "", ownerName: "", createdMs: now, updatedMs: now };
  save(db, item);
  sendJson(res, 201, item);
}
