import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { parseSavedSearch, type SavedSearch } from "@wizeworks/lens-core";
import { sendJson } from "@wizeworks/lens-node/kit";
import { parseJson, readBody } from "./body.js";

// Saved searches on the hub: `api/saved-searches`, per project ('' when none). Log searches become charts on the Logs page.
export const SAVED_SEARCH_SCHEMA = `
CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY, project TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, name TEXT NOT NULL, params TEXT NOT NULL, created_ms REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_saved_searches_project ON saved_searches (project, kind, created_ms);`;

interface Row {
  id: string;
  kind: string;
  name: string;
  params: string;
  created_ms: number;
}

const searchOf = (r: Row): SavedSearch => ({ id: r.id, kind: "logs", name: r.name, params: JSON.parse(r.params) as Record<string, string>, createdMs: r.created_ms, createdBy: null });

function list(db: DatabaseSync, project: string, kind: string): SavedSearch[] {
  const rows = db.prepare("SELECT id, kind, name, params, created_ms FROM saved_searches WHERE project = ? AND kind = ? ORDER BY created_ms, id").all(project, kind) as unknown as Row[];
  return rows.map(searchOf);
}

async function create(db: DatabaseSync, project: string, req: IncomingMessage, res: ServerResponse, now: number): Promise<void> {
  let parsed: ReturnType<typeof parseSavedSearch>;
  try {
    parsed = parseSavedSearch(parseJson(await readBody(req)));
  } catch {
    return sendJson(res, 400, { error: "invalid body" });
  }
  if (typeof parsed === "string") return sendJson(res, 400, { error: parsed });
  const id = randomUUID();
  db.prepare("INSERT INTO saved_searches (id, project, kind, name, params, created_ms) VALUES (?, ?, ?, ?, ?, ?)").run(id, project, parsed.kind, parsed.name, JSON.stringify(parsed.params), now);
  sendJson(res, 201, { search: { id, ...parsed, createdMs: now, createdBy: null } satisfies SavedSearch });
}

/** `GET|POST api/saved-searches?project=&kind=logs` and `DELETE api/saved-searches/{id}`. False when the path is not one of them. */
export async function handleSavedSearches(db: DatabaseSync, sub: string, req: IncomingMessage, res: ServerResponse, url: URL, now: number): Promise<boolean> {
  const project = url.searchParams.get("project") ?? "";
  const method = req.method ?? "GET";
  if (sub === "api/saved-searches" && method === "GET") return sendJson(res, 200, { searches: list(db, project, url.searchParams.get("kind") || "logs") }), true;
  if (sub === "api/saved-searches" && method === "POST") return await create(db, project, req, res, now), true;
  const m = /^api\/saved-searches\/([0-9a-f-]{36})$/.exec(sub);
  if (!m || method !== "DELETE") return false;
  const gone = db.prepare("DELETE FROM saved_searches WHERE id = ?").run(m[1]!).changes > 0;
  if (gone) res.writeHead(204).end();
  else sendJson(res, 404, { error: "search not found" });
  return true;
}
