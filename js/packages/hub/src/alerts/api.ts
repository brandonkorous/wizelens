// `api/alerts?project=`: the hub's alert rules. Rules, a rule's history, test, mute, and acknowledge. The hub sends no email.
import type { IncomingMessage, ServerResponse } from "node:http";
import { type AlertRule, MUTED_FOREVER, PAGE_SIZES, pageParams, parseAlertRule } from "@wizeworks/lens-core/internal";
import { sendJson } from "@wizeworks/lens-node/internal";
import { parseJson, readBody } from "../body.js";
import { sloById } from "../slos.js";
import { checkTarget } from "./target.js";
import { type HubAlertDeps, notifyHub } from "./evaluate.js";
import { addEvent, countEvents, createRule, deleteRule, listEvents, listRules, ruleById, ruleEvents, ruleValues, saveRule } from "./store.js";

const DAY_MS = 86_400_000;

/** The page of events a list asks for: `epage` and `esize`, 15 at first. */
const eventPage = (url: URL) => {
  const { page, size } = pageParams(Object.fromEntries(url.searchParams), PAGE_SIZES[0]!, "e");
  return { size, offset: (page - 1) * size };
};

interface AlertReq {
  deps: HubAlertDeps;
  now: number;
  project: string;
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
}

const body = async (req: IncomingMessage): Promise<Record<string, unknown>> => (parseJson(await readBody(req)) ?? {}) as Record<string, unknown>;

async function parsed(r: AlertReq, current?: AlertRule) {
  const b = { ...current, ...(await body(r.req)) };
  const checkSlo = async (id: string) => (sloById(r.deps.store.db, r.project, id) ? null : "That SLO is not in this project.");
  return parseAlertRule(b, { checkUrl: (url) => checkTarget(url, r.deps.outbox.allowPrivate), checkSlo });
}

async function create(r: AlertReq): Promise<void> {
  const input = await parsed(r);
  if (typeof input === "string") return sendJson(r.res, 400, { error: input });
  sendJson(r.res, 201, createRule(r.deps.store.db, r.project, input, r.now));
}

async function change(r: AlertReq, rule: AlertRule): Promise<void> {
  const input = await parsed(r, rule);
  if (typeof input === "string") return sendJson(r.res, 400, { error: input });
  const off = !input.enabled;
  const next: AlertRule = { ...rule, ...input, ...(off ? { state: "ok" as const, ackMs: null } : {}) };
  saveRule(r.deps.store.db, next, r.now);
  sendJson(r.res, 200, next);
}

async function mute(r: AlertReq, rule: AlertRule): Promise<void> {
  const raw = (await body(r.req)).untilMs;
  const untilMs = raw === null ? null : raw === -1 ? MUTED_FOREVER : Number(raw);
  if (untilMs !== null && (!Number.isFinite(untilMs) || untilMs <= r.now)) return sendJson(r.res, 400, { error: "Set untilMs to a future time, -1 for until unmuted, or null to unmute." });
  saveRule(r.deps.store.db, { ...rule, mutedUntilMs: untilMs }, r.now);
  const message = untilMs === null ? "Unmuted" : untilMs === MUTED_FOREVER ? "Muted until unmuted" : `Muted until ${new Date(untilMs).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  addEvent(r.deps.store.db, rule, { kind: untilMs === null ? "unmute" : "mute", value: null, message, timeMs: r.now, delivery: "" });
  sendJson(r.res, 200, { ...rule, mutedUntilMs: untilMs });
}

function ack(r: AlertReq, rule: AlertRule): void {
  if (rule.state !== "firing") return sendJson(r.res, 400, { error: "Only a firing rule can be acknowledged." });
  saveRule(r.deps.store.db, { ...rule, ackMs: r.now }, r.now);
  addEvent(r.deps.store.db, rule, { kind: "ack", value: rule.lastValue, message: "Acknowledged", timeMs: r.now, delivery: "" });
  sendJson(r.res, 200, { ...rule, ackMs: r.now });
}

function history(r: AlertReq, rule: AlertRule): void {
  const to = Number(r.url.searchParams.get("to")) || r.now + 1;
  const from = Number(r.url.searchParams.get("from")) || to - DAY_MS;
  const db = r.deps.store.db;
  const { size, offset } = eventPage(r.url);
  sendJson(r.res, 200, { rule, events: ruleEvents(db, rule.id, size, offset), eventCount: countEvents(db, { rule: rule.id }), values: ruleValues(db, rule.id, from, to) });
}

/** Every rule, and one page of the project's events. */
function list(r: AlertReq): void {
  const db = r.deps.store.db;
  const { size, offset } = eventPage(r.url);
  sendJson(r.res, 200, { rules: listRules(db, r.project), events: listEvents(db, r.project, size, offset), eventCount: countEvents(db, { project: r.project }) });
}

/** One rule's routes: `api/alerts/:id` and its actions. */
async function onRule(r: AlertReq, method: string, id: string, action: string | undefined): Promise<void> {
  const rule = ruleById(r.deps.store.db, r.project, id);
  if (!rule) return sendJson(r.res, 404, { error: "Alert rule not found." });
  if (!action && method === "GET") return history(r, rule);
  if (!action && method === "PATCH") return change(r, rule);
  if (!action && method === "DELETE") return (deleteRule(r.deps.store.db, r.project, id), sendJson(r.res, 200, { ok: true }));
  if (method !== "POST") return sendJson(r.res, 405, { error: "method not allowed" });
  if (action === "test") return sendJson(r.res, 200, { delivery: await notifyHub(r.deps, rule, "test", rule.lastValue, r.now) });
  if (action === "mute") return mute(r, rule);
  if (action === "ack") return ack(r, rule);
  sendJson(r.res, 404, { error: "not found" });
}

/** Routes under `api/alerts`. */
export async function handleAlerts(deps: HubAlertDeps, now: number, sub: string, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const method = req.method ?? "GET";
  const r: AlertReq = { deps, now, project: url.searchParams.get("project") ?? "", req, res, url };
  const [, , id, action] = sub.split("/");
  if (id) return onRule(r, method, decodeURIComponent(id), action);
  if (method === "GET") return list(r);
  if (method === "POST") return create(r);
  sendJson(res, 405, { error: "method not allowed" });
}
