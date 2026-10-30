import { type FactOptions, factOptionsOf, type ProjectSettings, type SettingsDefaults, settingsOf } from "@wizeworks/lens-core/internal";
import type { CloudConfig } from "../config.js";
import type { Queryable } from "../db/db.js";

const CACHE_MS = 60_000;

/** Days a project keeps data, in SQL with `p` (projects) and `o` (orgs): its own retention, never past its organization's. */
export const KEEP_DAYS = "LEAST(COALESCE(p.retention_days, o.retention_days), o.retention_days)";

interface SettingsRow {
  settings: string;
  retention_days: number | null;
  org_days: number;
}

/** A project's own settings, and how long its organization keeps data. Undefined when the project is gone. */
export async function projectSettingsOf(q: Queryable, projectId: string): Promise<{ settings: ProjectSettings; orgDays: number } | undefined> {
  const [row] = await q.query<SettingsRow>("SELECT p.settings, p.retention_days, o.retention_days AS org_days FROM projects p JOIN orgs o ON o.id = p.org_id WHERE p.id = $1", [projectId]);
  if (!row) return undefined;
  const settings = { ...settingsOf(row.settings), ...(row.retention_days ? { retentionDays: row.retention_days } : {}) };
  return { settings, orgDays: row.org_days };
}

/** Replace a project's own settings. Retention is a column, so prunes can read it in SQL. */
export async function saveProjectSettings(q: Queryable, projectId: string, s: ProjectSettings): Promise<void> {
  const { retentionDays, ...rest } = s;
  await q.query("UPDATE projects SET settings = $1, retention_days = $2 WHERE id = $3", [JSON.stringify(rest), retentionDays ?? null, projectId]);
}

/** The cloud's own values for a project in an organization that keeps `orgDays`. */
export const cloudDefaults = (config: Pick<CloudConfig, "slowQueryMs" | "nPlusOneThreshold" | "redactKeys">, orgDays: number): SettingsDefaults => ({
  slowQueryMs: config.slowQueryMs,
  nPlusOneThreshold: config.nPlusOneThreshold,
  redactKeys: config.redactKeys,
  retentionDays: orgDays,
});

/** The fact options a project's traces settle with: the cloud's, then the project's. */
export const factsWith = (config: Pick<CloudConfig, "slowQueryMs" | "nPlusOneThreshold">, s: ProjectSettings | undefined): Partial<FactOptions> => ({
  slowQueryMs: config.slowQueryMs,
  nPlusOneThreshold: config.nPlusOneThreshold,
  ...factOptionsOf(s),
});

/** The two thresholds in effect for a project, as numbers. */
export function thresholdsOf(config: Pick<CloudConfig, "slowQueryMs" | "nPlusOneThreshold">, s: ProjectSettings | undefined): { slowQueryMs: number; nPlusOneThreshold: number } {
  const f = factsWith(config, s);
  return { slowQueryMs: f.slowQueryMs!, nPlusOneThreshold: f.nPlusOneThreshold! };
}

/** Project settings, read at most once a minute per project in this process; a save here drops the entry at once. */
export class SettingsCache {
  private readonly entries = new Map<string, { s: ProjectSettings; atMs: number }>();

  constructor(private readonly q: Queryable) {}

  async get(projectId: string): Promise<ProjectSettings> {
    const hit = this.entries.get(projectId);
    if (hit && Date.now() - hit.atMs < CACHE_MS) return hit.s;
    const s = (await projectSettingsOf(this.q, projectId))?.settings ?? {};
    this.entries.set(projectId, { s, atMs: Date.now() });
    return s;
  }

  drop(projectId: string): void {
    this.entries.delete(projectId);
  }
}
