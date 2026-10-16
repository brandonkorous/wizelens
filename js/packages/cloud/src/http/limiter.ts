/** A fixed-window counter per key: at most `limit` calls per `windowMs`. In memory, per process. */
export class RateLimiter {
  readonly #counts = new Map<string, { start: number; n: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** True when the call is allowed. */
  take(key: string): boolean {
    const t = this.now();
    const c = this.#counts.get(key);
    if (!c || t - c.start >= this.windowMs) {
      this.#counts.set(key, { start: t, n: 1 });
      if (this.#counts.size > 10_000) this.#sweep(t);
      return true;
    }
    c.n++;
    return c.n <= this.limit;
  }

  #sweep(t: number): void {
    for (const [k, c] of this.#counts) if (t - c.start >= this.windowMs) this.#counts.delete(k);
  }
}
