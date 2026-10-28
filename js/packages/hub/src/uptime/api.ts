import type { IncomingMessage, ServerResponse } from "node:http";
import { parseCheckInput, sameCheckProblem, shownHeaders, UPTIME_LIMITS, type UptimeCheck, uptimeList } from "@wizeworks/lens-core";
import { sendJson } from "@wizeworks/lens-node/kit";
import type { ApiContext } from "../api.js";
import { parseJson, readBody } from "../body.js";
import { runHubCheck } from "./schedule.js";
import { checkById, countChecks, createCheck, deleteCheck, listChecks, listIncidents, updateCheck } from "./store.js";

/** A change must come from a page on this hub (or a script, which sends no Origin): other sites may not add checks here. */
function fromThisHub(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  return URL.canParse(origin) && new URL(origin).host === req.headers.host;
}

function list(c: ApiContext, p: URLSearchParams, res: ServerResponse): void {
  const db = c.data.store.db;
  const checks = listChecks(db, p.get("project") ?? undefined);
  const now = c.o.now();
  sendJson(res, 200, uptimeList(checks, listIncidents(db, checks.map((x) => x.id), now), now));
}

/** A check as the API shows it: secret-looking header values hidden. */
const shown = (c: UptimeCheck | undefined) => c && { ...c, headers: shownHeaders(c.headers) };

async function bodyOf(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = parseJson(await readBody(req));
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

async function create(c: ApiContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = c.data.store.db;
  if (countChecks(db) >= UPTIME_LIMITS.maxChecks) return sendJson(res, 400, { error: `A hub runs at most ${UPTIME_LIMITS.maxChecks} checks.` });
  const body = await bodyOf(req);
  const parsed = parseCheckInput(body);
  if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
  const project = typeof body.project === "string" ? body.project.slice(0, 100) : "";
  const twin = sameCheckProblem(listChecks(db, project), parsed.input);
  if (twin) return sendJson(res, 409, { error: twin });
  const id = createCheck(db, project, parsed.input, c.o.now());
  sendJson(res, 201, shown(checkById(db, id)));
}

async function change(c: ApiContext, id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = c.data.store.db;
  const current = checkById(db, id);
  if (!current) return sendJson(res, 404, { error: "Check not found." });
  const parsed = parseCheckInput(await bodyOf(req), current);
  if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
  const twin = sameCheckProblem(listChecks(db, current.project), parsed.input, id);
  if (twin) return sendJson(res, 409, { error: twin });
  updateCheck(db, current, parsed.input, c.o.now());
  sendJson(res, 200, shown(checkById(db, id)));
}

async function runNow(c: ApiContext, id: string, res: ServerResponse): Promise<void> {
  const check = checkById(c.data.store.db, id);
  if (!check) return sendJson(res, 404, { error: "Check not found." });
  await runHubCheck(c.data, check, { allowPrivate: true, now: c.o.now });
  sendJson(res, 200, shown(checkById(c.data.store.db, id)));
}

/** `api/uptime` and `api/uptime/<id>`: list, add, change, remove, and run a check now. */
export async function handleUptime(c: ApiContext, sub: string, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (!c.o.uptime) return sendJson(res, 404, { error: "Uptime checks are off on this hub (--no-uptime)." });
  const method = req.method ?? "GET";
  if (method !== "GET" && !fromThisHub(req)) return sendJson(res, 403, { error: "Changes must come from this hub's dashboard." });
  const m = /^api\/uptime(?:\/([0-9a-f-]{36}))?(\/run)?$/.exec(sub);
  if (!m) return sendJson(res, 404, { error: "not found" });
  const [, id, run] = m;
  if (!id && method === "GET") return list(c, url.searchParams, res);
  if (!id && method === "POST") return create(c, req, res);
  if (id && run && method === "POST") return runNow(c, id, res);
  if (id && !run && method === "PATCH") return change(c, id, req, res);
  if (id && !run && method === "DELETE") return sendJson(res, deleteCheck(c.data.store.db, id) ? 200 : 404, { ok: true });
  sendJson(res, 405, { error: "method not allowed" });
}
