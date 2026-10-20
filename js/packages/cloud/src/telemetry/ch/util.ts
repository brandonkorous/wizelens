// Shared bits of the ClickHouse store: row versions, retention lookups, and row objects from column lists.
import { isLooseTraceId } from "@wizeworks/lens-core";
import type { OrgOf, RetentionOf } from "../store.js";

const DAY_MS = 86_400_000;
const RETENTION_CACHE_MS = 60_000;

let lastVer = 0;

/** A row version that only grows: ms times 1000, plus a counter within the same ms. */
export function nextVer(now: number): number {
  lastVer = Math.max(lastVer + 1, Math.floor(now) * 1000);
  return lastVer;
}

/** Retention days per project, from Postgres, cached for a minute. */
export class RetentionCache {
  private readonly cache = new Map<string, { days: number; atMs: number }>();

  constructor(
    private readonly lookup: RetentionOf,
    private readonly defaultDays: number,
  ) {}

  async daysOf(projectIds: readonly string[]): Promise<Map<string, number>> {
    const now = Date.now();
    const missing = [...new Set(projectIds)].filter((id) => !this.cache.has(id) || now - this.cache.get(id)!.atMs > RETENTION_CACHE_MS);
    if (missing.length) {
      const found = await this.lookup(missing);
      for (const id of missing) this.cache.set(id, { days: found.get(id) ?? this.defaultDays, atMs: now });
    }
    return new Map(projectIds.map((id) => [id, this.cache.get(id)!.days]));
  }

  async msOf(projectId: string): Promise<number> {
    return (await this.daysOf([projectId])).get(projectId)! * DAY_MS;
  }
}

/** The organization of each project, from Postgres. Kept for good: a project never moves to another organization. */
export class OrgCache {
  private readonly cache = new Map<string, string>();

  constructor(private readonly lookup: OrgOf) {}

  /** The organization of each project that still exists; deleted ones are left out. */
  async of(projectIds: readonly string[]): Promise<Map<string, string>> {
    const missing = [...new Set(projectIds)].filter((id) => !this.cache.has(id));
    if (missing.length) for (const [id, org] of await this.lookup(missing)) if (org) this.cache.set(id, org);
    return new Map(projectIds.flatMap((id) => (this.cache.has(id) ? [[id, this.cache.get(id)!] as const] : [])));
  }

  /** One project's organization. Throws for a deleted project, so no row is written without one. */
  async one(projectId: string): Promise<string> {
    const org = (await this.of([projectId])).get(projectId);
    if (!org) throw new Error(`Project ${projectId} does not exist.`);
    return org;
  }
}

/** How long a project keeps trace rows and log rows, in ms. */
export interface Keep {
  ms: number;
  logMs: number;
}

/** How long a log line is kept: the log retention outside a request; in one, never past its trace. */
export const logKeepOf = (traceId: string, keep: Keep): number => (isLooseTraceId(traceId) ? keep.logMs : Math.min(keep.ms, keep.logMs));

/** A row object from a column list and values in the same order. */
export function rowOf(cols: readonly string[], values: readonly unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  cols.forEach((c, i) => (out[c] = values[i] ?? null));
  return out;
}

export const byProject = <T extends { project: string }>(items: readonly T[]): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const it of items) out.set(it.project, [...(out.get(it.project) ?? []), it]);
  return out;
};

export { DAY_MS };
