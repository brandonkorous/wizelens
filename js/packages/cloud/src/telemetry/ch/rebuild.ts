// Rebuilding stats after the facts version changes: traces join the settle queue one page at a time, so memory stays small.
import type { ChClient } from "./http.js";
import type { SettleQueue } from "./queue.js";
import { nextVer } from "./util.js";

const PAGE = 5_000;
const KEY = "rebuild";
const DONE = "done";

/** The last trace of the pages already settled, or null when no rebuild runs. */
type Cursor = [project: string, traceId: string] | null;

export const ensureMeta = (ch: ChClient) =>
  ch.command("CREATE TABLE IF NOT EXISTS ch_meta (key String, value String, ver UInt64) ENGINE = ReplacingMergeTree(ver) ORDER BY key");

const save = (ch: ChClient, at: Cursor) => ch.insert("ch_meta", [{ key: KEY, value: at ? JSON.stringify(at) : DONE, ver: nextVer(Date.now()) }]);

export class Rebuild {
  /** Keys of the page in the queue now; the next page loads when they are all settled. */
  private page: string[] = [];
  /** The current page is the last one. */
  private ended = false;
  private loading = false;

  private constructor(
    private readonly ch: ChClient,
    private readonly queue: SettleQueue,
    private at: Cursor,
    private readonly size: number,
  ) {}

  /** Picks up a rebuild a restart cut short, from its last settled page. */
  static async open(ch: ChClient, queue: SettleQueue, size = PAGE): Promise<Rebuild> {
    await ensureMeta(ch);
    const [row] = await ch.query<{ value: string }>(`SELECT value FROM ch_meta FINAL WHERE key = '${KEY}'`);
    return new Rebuild(ch, queue, row && row.value !== DONE ? (JSON.parse(row.value) as Cursor) : null, size);
  }

  /** Every trace settles again, from the first. */
  async start(): Promise<void> {
    this.at = ["", ""];
    this.page = [];
    this.ended = false;
    await save(this.ch, this.at);
  }

  /** Before each settle run: when the current page is done, save the place and queue the next page. */
  async refill(): Promise<void> {
    if (!this.at || this.loading) return;
    this.page = this.page.filter((k) => this.queue.has(k));
    if (this.page.length) return;
    this.loading = true;
    try {
      await save(this.ch, this.ended ? null : this.at);
      if (this.ended) this.at = null;
      else await this.next(this.at);
    } finally {
      this.loading = false;
    }
  }

  private async next(after: [string, string]): Promise<void> {
    const rows = await this.ch.query<{ project_id: string; trace_id: string; env: string; u: number }>(
      `SELECT project_id, trace_id, max(env) AS env, max(updated_ms) AS u FROM trace_heads WHERE (project_id, trace_id) > ({p1:String}, {p2:String})
       GROUP BY project_id, trace_id ORDER BY project_id, trace_id LIMIT ${this.size}`,
      after,
    );
    this.page = rows.map((r) => this.queue.requeue(r.project_id, r.trace_id, r.env, r.u));
    const last = rows.at(-1);
    if (last) this.at = [last.project_id, last.trace_id];
    this.ended = rows.length < this.size;
  }
}
