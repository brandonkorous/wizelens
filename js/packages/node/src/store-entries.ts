import { isLooseTraceId, type LogRecord, newLooseTraceId, LOOSE_WINDOW_MS, type Span } from "@wizeworks/lens-core/internal";

export interface Entry {
  traceId: string;
  spans: Map<string, Span>;
  logs: LogRecord[];
  remotes: Set<string>;
  sessions: Set<string>;
  /** Earliest span start or log time. Used for age eviction. */
  startMs: number;
}

const newEntry = (traceId: string, startMs: number): Entry => ({ traceId, spans: new Map(), logs: [], remotes: new Set(), sessions: new Set(), startMs });

/** Traces and loose batches (lines outside a request), each with its own cap, so neither pushes the other out. Oldest first. */
export class EntryMap {
  readonly #traces = new Map<string, Entry>();
  readonly #loose = new Map<string, Entry>();

  constructor(
    private readonly maxTraces: number,
    private readonly maxLoose: number,
  ) {}

  /** Request traces only, as the dashboard counts them. */
  get size(): number {
    return this.#traces.size;
  }

  #mapOf(traceId: string): Map<string, Entry> {
    return isLooseTraceId(traceId) ? this.#loose : this.#traces;
  }

  get(traceId: string): Entry | undefined {
    return this.#mapOf(traceId).get(traceId);
  }

  /** The entry, made when missing; the oldest of its kind goes when its kind is over its cap. */
  touch(traceId: string, startMs: number): Entry {
    const map = this.#mapOf(traceId);
    let entry = map.get(traceId);
    if (!entry) {
      map.set(traceId, (entry = newEntry(traceId, startMs)));
      const cap = map === this.#loose ? this.maxLoose : this.maxTraces;
      while (map.size > cap) map.delete(map.keys().next().value!);
    } else if (startMs < entry.startMs) entry.startMs = startMs;
    return entry;
  }

  delete(traceId: string): void {
    this.#mapOf(traceId).delete(traceId);
  }

  /** Every entry: traces, then loose batches. */
  *values(): IterableIterator<Entry> {
    yield* this.#traces.values();
    yield* this.#loose.values();
  }

  clear(): void {
    this.#traces.clear();
    this.#loose.clear();
  }
}

/** Picks the loose trace id for the next line outside a request: a new batch per 5-minute window, or when the batch is full. */
export class LooseBatcher {
  #id = "";
  #window = -1;
  #count = 0;

  constructor(private readonly maxLines: number) {}

  idFor(timeMs: number): string {
    const window = Math.floor(timeMs / LOOSE_WINDOW_MS);
    if (!this.#id || window !== this.#window || this.#count >= this.maxLines) {
      this.#id = newLooseTraceId();
      this.#window = window;
      this.#count = 0;
    }
    this.#count++;
    return this.#id;
  }
}
