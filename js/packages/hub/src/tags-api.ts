import type { IncomingMessage, ServerResponse } from "node:http";
import { activeTags, BUILT_IN_PREFIX, checkTagInput, matchTags, searchSql, SQLITE_DIALECT, TAG_LIMITS, tagMatchRequestOf } from "@wizeworks/lens-core";
import { sendJson } from "@wizeworks/lens-node/kit";
import type { ApiContext } from "./api.js";
import { parseJson, readBody } from "./body.js";
import { sqliteRunner } from "./scale-exec.js";
import { createTag, deleteTag, hubTags, setBuiltIn, updateTag } from "./tags.js";

// The hub's tags API (docs/TAGS-PLAN.md). Changes come only from the hub's own pages (or a tool with no Origin), never another site.

/** True when a browser sent this from the hub's own origin, or no browser sent it. */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function bodyOf(req: IncomingMessage): Promise<Record<string, unknown>> {
  try {
    const b = parseJson(await readBody(req));
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function create(c: ApiContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = c.data.store.db;
  const own = hubTags(db).filter((t) => !t.builtIn);
  if (own.length >= TAG_LIMITS.rules) return sendJson(res, 400, { error: `The hub holds up to ${TAG_LIMITS.rules} tags. Delete one first.` });
  const r = checkTagInput(await bodyOf(req), own.map((t) => t.name));
  if (!r.ok) return sendJson(res, 400, r);
  sendJson(res, 201, createTag(db, r.input, c.o.now()));
}

/** A rule takes name, color, and query (what is left out stays); a built-in takes only `enabled`. */
async function change(c: ApiContext, id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = c.data.store.db;
  const body = await bodyOf(req);
  if (id.startsWith(BUILT_IN_PREFIX)) {
    if (typeof body.enabled !== "boolean") return sendJson(res, 400, { error: "A built-in tag can only be turned on or off: send { enabled }." });
    return setBuiltIn(db, id, body.enabled) ? sendJson(res, 200, hubTags(db).find((t) => t.id === id)) : sendJson(res, 404, { error: "Tag not found." });
  }
  const tags = hubTags(db);
  const current = tags.find((t) => t.id === id && !t.builtIn);
  if (!current) return sendJson(res, 404, { error: "Tag not found." });
  const r = checkTagInput({ ...current, ...body }, tags.filter((t) => !t.builtIn && t.id !== id).map((t) => t.name));
  if (!r.ok) return sendJson(res, 400, r);
  updateTag(db, id, r.input, c.o.now());
  sendJson(res, 200, { ...current, ...r.input });
}

async function match(c: ApiContext, req: IncomingMessage, res: ServerResponse, p: URLSearchParams): Promise<void> {
  const r = tagMatchRequestOf(await bodyOf(req));
  if (!r.ok) return sendJson(res, 400, r);
  const src = { d: SQLITE_DIALECT, run: sqliteRunner(c.data.store.db), scope: { project: p.get("project") || undefined } };
  sendJson(res, 200, { matches: await matchTags((q) => searchSql(src, q), r.kind, r.items, activeTags(hubTags(c.data.store.db)), p.get("env") || undefined) });
}

function remove(c: ApiContext, id: string, res: ServerResponse): void {
  if (deleteTag(c.data.store.db, id)) sendJson(res, 200, { ok: true });
  else sendJson(res, 404, { error: "Tag not found." });
}

async function routeTags(c: ApiContext, sub: string, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const method = req.method ?? "GET";
  if (sub === "api/tags" && method === "GET") return sendJson(res, 200, { tags: hubTags(c.data.store.db), editable: true, max: TAG_LIMITS.rules });
  if (sub === "api/tags/match" && method === "POST") return match(c, req, res, url.searchParams);
  if (!sameOrigin(req)) return sendJson(res, 403, { error: "Change tags from the hub's own dashboard." });
  const id = decodeURIComponent(sub.slice("api/tags/".length));
  if (sub === "api/tags" && method === "POST") return create(c, req, res);
  if (id && method === "PATCH") return change(c, id, req, res);
  if (id && method === "DELETE") return remove(c, id, res);
  sendJson(res, 405, { error: "method not allowed" });
}

/** `api/tags`, `api/tags/match`, and `api/tags/{id}`. False when `sub` is not a tags path. */
export async function handleTags(c: ApiContext, sub: string, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (sub !== "api/tags" && !sub.startsWith("api/tags/")) return false;
  await routeTags(c, sub, req, res, url);
  return true;
}
