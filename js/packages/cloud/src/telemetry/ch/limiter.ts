// A cap on ClickHouse calls in flight per process: a page or a test that asks for many reads at once waits in line instead of flooding the server.

/** Calls in flight per process when WIZELENS_CLOUD_CLICKHOUSE_CONCURRENCY is not set. */
export const DEFAULT_CH_CONCURRENCY = 24;

export class Limiter {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  /** The most calls that were in flight at once. */
  peak = 0;

  constructor(readonly max: number) {
    if (!Number.isInteger(max) || max < 1) throw new Error(`A limiter needs a whole number of slots, got ${max}`);
  }

  /** Run `fn` when a slot is free. A finished call hands its slot straight to the next waiter, so the cap is never passed. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active < this.max) this.active++;
    else await new Promise<void>((r) => this.waiting.push(r));
    this.peak = Math.max(this.peak, this.active);
    try {
      return await fn();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }

  /** Calls running now, and calls waiting for a slot. */
  get load(): { active: number; waiting: number } {
    return { active: this.active, waiting: this.waiting.length };
  }
}

/** The slots from the environment: WIZELENS_CLOUD_CLICKHOUSE_CONCURRENCY when it is a positive whole number, else the default. */
export function concurrencyOf(env: string | undefined): number {
  const n = Number(env);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_CH_CONCURRENCY;
}

let shared: Limiter | null = null;

/** The one limiter every client of this process (or worker thread) shares. */
export const sharedLimiter = (): Limiter => (shared ??= new Limiter(concurrencyOf(process.env.WIZELENS_CLOUD_CLICKHOUSE_CONCURRENCY)));
