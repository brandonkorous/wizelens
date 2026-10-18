// Shared bits of the ClickHouse store: row versions, retention lookups, and row objects from column lists.
import type { RetentionOf } from "../store.js";

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
