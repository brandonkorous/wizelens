import type { Queryable } from "../db/db.js";

// Ingest usage per organization per UTC day (usage_daily). Counters live in memory and flush every minute and at shutdown.

export interface UsageCounts {
  bytes: number;
  spans: number;
  logs: number;
  points: number;
}

/** "2026-10-19" for a time in ms, in UTC. */
export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
/** "2026-10" for a time in ms, in UTC. */
export const monthOf = (ms: number): string => new Date(ms).toISOString().slice(0, 7);

const empty = (): UsageCounts => ({ bytes: 0, spans: 0, logs: 0, points: 0 });

function addInto(into: UsageCounts, c: Partial<UsageCounts>): void {
  into.bytes += c.bytes ?? 0;
  into.spans += c.spans ?? 0;
  into.logs += c.logs ?? 0;
  into.points += c.points ?? 0;
}

/** Bytes this month per organization, as saved: the sum of its usage_daily rows. */
async function savedMonthBytes(q: Queryable, month: string, orgIds: string[]): Promise<Map<string, number>> {
  if (!orgIds.length) return new Map();
  const rows = await q.query<{ org_id: string; bytes: number }>(
    `SELECT org_id, SUM(bytes)::double precision AS bytes FROM usage_daily WHERE day LIKE $1 AND org_id IN (${orgIds.map((_, i) => `$${i + 2}`).join(", ")}) GROUP BY org_id`,
    [`${month}-%`, ...orgIds],
  );
  return new Map(rows.map((r) => [r.org_id, Number(r.bytes)]));
}

export class UsageMeter {
  /** Not yet saved, by "orgId|day". */
  #pending = new Map<string, UsageCounts>();
  /** Saved bytes this month, by organization, refreshed at every flush (other instances add to the same rows). */
  #saved = new Map<string, number>();
  #savedMonth = "";

  constructor(
    private readonly db: Queryable,
    private readonly now: () => number,
  ) {}

  add(orgId: string, c: Partial<UsageCounts>): void {
    const key = `${orgId}|${dayOf(this.now())}`;
    const row = this.#pending.get(key) ?? empty();
    addInto(row, c);
    this.#pending.set(key, row);
  }

  /** Bytes this month: saved plus not yet saved. */
  async monthBytes(orgId: string): Promise<number> {
    const month = monthOf(this.now());
    if (month !== this.#savedMonth) (this.#saved.clear(), (this.#savedMonth = month));
    if (!this.#saved.has(orgId)) this.#saved.set(orgId, (await savedMonthBytes(this.db, month, [orgId])).get(orgId) ?? 0);
    let pending = 0;
    for (const [key, c] of this.#pending) if (key.startsWith(`${orgId}|${month}`)) pending += c.bytes;
    return this.#saved.get(orgId)! + pending;
  }

  /** Save the counters (added to the day's row), then reread this month's totals. A failed save keeps them for the next try. */
  async flush(): Promise<void> {
    const batch = this.#pending;
    this.#pending = new Map();
    try {
      for (const [key, c] of batch) await this.#save(key, c);
    } catch (err) {
      for (const [key, c] of batch) addInto(this.#pending.get(key) ?? (this.#pending.set(key, empty()), this.#pending.get(key)!), c);
      throw err;
    }
    const month = monthOf(this.now());
    if (month !== this.#savedMonth) (this.#saved.clear(), (this.#savedMonth = month));
    const fresh = await savedMonthBytes(this.db, month, [...this.#saved.keys()]);
    for (const id of this.#saved.keys()) this.#saved.set(id, fresh.get(id) ?? 0);
  }

  async #save(key: string, c: UsageCounts): Promise<void> {
    const [orgId, day] = key.split("|") as [string, string];
    await this.db.query(
      `INSERT INTO usage_daily (org_id, day, bytes, spans, logs, points) SELECT $1, $2, $3, $4, $5, $6 WHERE EXISTS (SELECT 1 FROM orgs WHERE id = $1)
       ON CONFLICT (org_id, day) DO UPDATE SET bytes = usage_daily.bytes + EXCLUDED.bytes, spans = usage_daily.spans + EXCLUDED.spans,
       logs = usage_daily.logs + EXCLUDED.logs, points = usage_daily.points + EXCLUDED.points`,
      [orgId, day, c.bytes, c.spans, c.logs, c.points],
    );
  }
}

export interface UsageDay extends UsageCounts {
  day: string;
}

/** One organization's days in a month ("2026-10"), oldest first. */
export const usageDays = (q: Queryable, orgId: string, month: string): Promise<UsageDay[]> =>
  q.query<UsageDay>(
    `SELECT day, bytes::double precision AS bytes, spans::double precision AS spans, logs::double precision AS logs, points::double precision AS points
     FROM usage_daily WHERE org_id = $1 AND day LIKE $2 ORDER BY day`,
    [orgId, `${month}-%`],
  );
