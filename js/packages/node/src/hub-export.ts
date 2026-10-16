import { context, ROOT_CONTEXT } from "@opentelemetry/api";
import type { HubLog, HubRemote, HubSender, IngestBatch, MetricPoint, Span } from "@wizeworks/lens-core";
import type { MetricStore } from "./metrics/store.js";
import type { StoreEvent, TraceStore } from "./store.js";

export interface HubExporterOptions {
  /** Hub base URL, for example "http://localhost:5960". */
  url: string;
  token?: string;
  sender: () => HubSender;
  /** How often to send. Default 1000 ms. */
  intervalMs?: number;
  /** Most items waiting to be sent. The oldest are dropped first. Default 20000. */
  maxQueue?: number;
  warn?: (message: string) => void;
  now?: () => number;
}

const HEARTBEAT_MS = 10_000;
const BATCH = 1000;
const MAX_BACKOFF_MS = 30_000;
const TIMEOUT_MS = 5000;

/** Sends every new span, log, remote, and metric point to the hub in batches; a hub that is down never slows the app. */
export class HubExporter {
  readonly url: string;
  readonly #o: HubExporterOptions;
  readonly #now: () => number;
  #spans: Span[] = [];
  #logs: HubLog[] = [];
  #remotes: HubRemote[] = [];
  #metrics: MetricPoint[] = [];
  #timer: ReturnType<typeof setInterval> | undefined;
  #sending: Promise<void> | null = null;
  #lastSentMs = 0;
  #failures = 0;
  #retryAtMs = 0;
  #warned = false;
  dropped = 0;

  constructor(options: HubExporterOptions) {
    this.#o = options;
    this.url = options.url;
    this.#now = options.now ?? Date.now;
  }

  get queued(): number {
    return this.#spans.length + this.#logs.length + this.#remotes.length + this.#metrics.length;
  }

  attach(store: TraceStore): () => void {
    return store.subscribe((e) => this.add(e));
  }

  /** Forward the add-on's metric points too. */
  attachMetrics(metrics: MetricStore): () => void {
    return metrics.subscribe((points) => this.addMetrics(points));
  }

  addMetrics(points: readonly MetricPoint[]): void {
    this.#metrics.push(...points);
    this.#trim();
  }

  add(e: StoreEvent): void {
    if (e.type === "span") this.#spans.push(e.span);
    else if (e.type === "log") this.#logs.push({ traceId: e.traceId, log: e.log });
    else this.#remotes.push({ traceId: e.traceId, endpoint: e.endpoint });
    this.#trim();
  }

  #trim(): void {
    const max = this.#o.maxQueue ?? 20_000;
    // Metric points go first: a trace is worth more than one sample.
    for (const list of [this.#metrics, this.#spans, this.#logs, this.#remotes] as unknown[][]) {
      const over = this.queued - max;
      if (over <= 0) return;
      const n = Math.min(over, list.length);
      list.splice(0, n);
      this.dropped += n;
    }
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.tick(), this.#o.intervalMs ?? 1000);
    this.#timer.unref?.();
    void this.tick();
  }

  /** Send one batch when there is data, or a heartbeat when it is time. */
  async tick(): Promise<void> {
    if (this.#sending || this.#now() < this.#retryAtMs) return;
    if (this.queued === 0 && this.#now() - this.#lastSentMs < HEARTBEAT_MS) return;
    this.#sending = this.#sendBatch().finally(() => (this.#sending = null));
    await this.#sending;
  }

  async #sendBatch(): Promise<void> {
    const batch: IngestBatch = {
      sender: this.#o.sender(),
      spans: this.#spans.splice(0, BATCH),
      logs: this.#logs.splice(0, BATCH),
      remotes: this.#remotes.splice(0, BATCH),
      metrics: this.#metrics.splice(0, BATCH),
    };
    if (await this.#post(batch)) return this.#ok();
    this.#spans.unshift(...batch.spans!);
    this.#logs.unshift(...batch.logs!);
    this.#remotes.unshift(...batch.remotes!);
    this.#metrics.unshift(...batch.metrics!);
    this.#trim();
    this.#fail();
  }

  async #post(batch: IngestBatch): Promise<boolean> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.#o.token) headers.Authorization = `Bearer ${this.#o.token}`;
    try {
      // The root context keeps this call out of the app's own traces.
      const res = await context.with(ROOT_CONTEXT, () =>
        fetch(`${this.url}/_wizelens/api/ingest`, { method: "POST", headers, body: JSON.stringify(batch), signal: AbortSignal.timeout(TIMEOUT_MS) }),
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  #ok(): void {
    if (this.#failures > 0 && this.#warned) this.#o.warn?.(`[wizelens] Connected to the hub at ${this.url} again.`);
    this.#failures = 0;
    this.#warned = false;
    this.#lastSentMs = this.#now();
  }

  #fail(): void {
    this.#failures++;
    this.#retryAtMs = this.#now() + Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.#failures, 5));
    if (this.#warned) return;
    this.#warned = true;
    this.#o.warn?.(`[wizelens] Could not reach the hub at ${this.url}. Traces stay in this app, and sending will retry.`);
  }

  /** Send what is left (best effort), then stop. */
  async stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    await this.#sending;
    this.#retryAtMs = 0;
    if (this.queued > 0) await this.tick();
  }
}
