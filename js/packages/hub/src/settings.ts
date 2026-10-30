// Project settings on the hub: `api/settings?project=`. Thresholds and extra redacted keys apply to new data; a shorter retention at the next prune.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { effectiveSettings, type FactOptions, factOptionsOf, parseSettings, type ProjectSettings, type SettingsDefaults, settingsOf } from "@wizeworks/lens-core/internal";
import { sendJson } from "@wizeworks/lens-node/internal";
import { parseJson, readBody } from "./body.js";

const DAY_MS = 86_400_000;

/** The settings of every project, read again only after a change. */
const cache = new WeakMap<DatabaseSync, Map<string, ProjectSettings>>();

export function allSettings(db: DatabaseSync): Map<string, ProjectSettings> {
  let map = cache.get(db);
  if (!map) {
    const rows = db.prepare("SELECT project, json FROM project_settings").all() as { project: string; json: string }[];
    cache.set(db, (map = new Map(rows.map((r) => [r.project, settingsOf(r.json)]))));
  }
  return map;
}

export const projectSettings = (db: DatabaseSync, project: string): ProjectSettings => allSettings(db).get(project) ?? {};

export function saveSettings(db: DatabaseSync, project: string, s: ProjectSettings): void {
  if (Object.keys(s).length) db.prepare("INSERT INTO project_settings (project, json) VALUES (?, ?) ON CONFLICT (project) DO UPDATE SET json = excluded.json").run(project, JSON.stringify(s));
  else db.prepare("DELETE FROM project_settings WHERE project = ?").run(project);
  cache.delete(db);
}

/** What the hub keeps and how it judges, set by its start options. */
export interface HubSettingsHost {
  db: DatabaseSync;
  maxAgeMs: number;
  slowQueryMs: number;
  nPlusOneThreshold: number;
  redactKeys: readonly string[];
}

/** The hub's own values. Retention is in whole days, at least 1. */
export const hubDefaults = (h: HubSettingsHost): SettingsDefaults => ({
  slowQueryMs: h.slowQueryMs,
  nPlusOneThreshold: h.nPlusOneThreshold,
  redactKeys: h.redactKeys,
  retentionDays: Math.max(1, Math.floor(h.maxAgeMs / DAY_MS)),
});

/** How long a project's traces stay: its own retention when shorter than the hub's. */
export function keepMsOf(h: Pick<HubSettingsHost, "db" | "maxAgeMs">, project: string): number {
  const days = projectSettings(h.db, project).retentionDays;
  return days ? Math.min(days * DAY_MS, h.maxAgeMs) : h.maxAgeMs;
}

/** How long a project's log lines stay: the hub's log age, or the project's own retention when shorter. */
export function logKeepMsOf(h: Pick<HubSettingsHost, "db"> & { logsMaxAgeMs: number }, project: string): number {
  const days = projectSettings(h.db, project).retentionDays;
  return days ? Math.min(days * DAY_MS, h.logsMaxAgeMs) : h.logsMaxAgeMs;
}

/** The thresholds a project's traces settle with. */
export const factsOf = (h: HubSettingsHost, project: string): Partial<FactOptions> => ({
  slowQueryMs: h.slowQueryMs,
  nPlusOneThreshold: h.nPlusOneThreshold,
  ...factOptionsOf(projectSettings(h.db, project)),
});

/** GET: the hub's values, the project's own, and the ones in effect. PUT: replace the project's own. */
export async function handleSettings(h: HubSettingsHost, method: string, project: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const defaults = hubDefaults(h);
  const reply = (s: ProjectSettings) => sendJson(res, 200, { defaults, settings: s, effective: effectiveSettings(defaults, s) });
  if (method === "GET") return reply(projectSettings(h.db, project));
  if (method !== "PUT") return sendJson(res, 405, { error: "method not allowed" });
  let next: ProjectSettings;
  try {
    next = parseSettings(parseJson(await readBody(req)), defaults.retentionDays);
  } catch (err) {
    return sendJson(res, 400, { error: err instanceof Error ? err.message : "Invalid settings." });
  }
  saveSettings(h.db, project, next);
  reply(next);
}
