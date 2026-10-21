import { isDocument } from "../document-request.js";
import type { RecordedRequest, ServerStats } from "../recorder-types.js";

/** One page the HUD has seen: the full load, or a client-side route change. */
export interface HudPage {
  id: number;
  url: string;
  /** "/orders?tab=open". */
  path: string;
  navigation: "load" | "spa";
  /** Epoch ms. */
  startMs: number;
  /** Route change to the next paint. Spa pages only. */
  renderMs: number | null;
  /** The request that rendered the page, from the recorder (with its server stats). Full loads only. */
  doc: RecordedRequest | null;
  /** The fetch and XHR calls the page made, by id, oldest first. */
  calls: Map<string, RecordedRequest>;
  /** Calls dropped to keep memory small. They still count in Fetch. */
  dropped: number;
  /** Calls the tab made twice or more before this page, like a status poll. They do not time a route change. */
  recurring: ReadonlySet<string>;
}

/** A call's method and path, without the query. */
export const callKey = (r: RecordedRequest) => `${r.method} ${r.path.split("?")[0]}`;

// Pages kept for a pinned page, and calls kept per page.
const MAX_PAGES = 10;
export const MAX_CALLS = 2000;

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

const finished = (r: RecordedRequest) => r.durationMs !== null || !!r.error;

const newPage = (id: number, url: string, startMs: number, navigation: HudPage["navigation"], recurring: ReadonlySet<string> = new Set()): HudPage => ({
  id,
  url,
  path: pathOf(url),
  navigation,
  startMs,
  renderMs: null,
  doc: null,
  calls: new Map(),
  dropped: 0,
  recurring,
});

/** The pages of this tab and the calls each one made. It keeps calls after they fall out of the recorder's short list. */
export class PageLog {
  #pages: HudPage[];
  #next = 2;
  #seen = new Map<string, number>();
  // Profiled calls that are done but have no server stats yet.
  #waiting = new Map<string, HudPage>();

  constructor(url: string, startMs: number) {
    this.#pages = [newPage(1, url, startMs, "load")];
  }

  get current(): HudPage {
    return this.#pages[this.#pages.length - 1]!;
  }

  find(id: number | null): HudPage | null {
    return this.#pages.find((p) => p.id === id) ?? null;
  }

  /** A client-side route change to `url`. The same path with another query is not a new page. */
  navigate(url: string, startMs: number): HudPage | null {
    if (pathOf(url).split("?")[0] === this.current.path.split("?")[0]) return null;
    const recurring = new Set([...this.#seen].filter(([, n]) => n >= 2).map(([key]) => key));
    const page = newPage(this.#next++, url, startMs, "spa", recurring);
    this.#pages = [...this.#pages, page].slice(-MAX_PAGES);
    return page;
  }

  /** Forget the calls of `page`. */
  clear(page: HudPage): void {
    page.calls = new Map();
    page.dropped = 0;
  }

  /** Take in the recorder's rows. Each live row goes to the page it started on. */
  take(rows: readonly RecordedRequest[]): void {
    for (const r of [...rows].reverse()) {
      if (r.restored) continue;
      if (isDocument(r)) {
        const load = this.#pages[0]!;
        if (load.navigation === "load") load.doc = r;
        continue;
      }
      const page = this.#pageAt(r.startMs);
      if (page) this.#keep(page, r);
    }
  }

  /** Give calls that left the recorder's list before their stats came the stats it loaded since. */
  fill(statsOf: (traceId: string) => ServerStats | null): void {
    for (const [id, page] of this.#waiting) {
      const r = page.calls.get(id);
      const server = r ? statsOf(r.traceId) : null;
      if (r && server) page.calls.set(id, { ...r, server });
      if (!r || server) this.#waiting.delete(id);
    }
  }

  // The newest page that started at or before `ms`.
  #pageAt(ms: number): HudPage | null {
    for (let i = this.#pages.length - 1; i >= 0; i--) if (this.#pages[i]!.startMs <= ms) return this.#pages[i]!;
    return this.#pages[0]!.navigation === "load" ? this.#pages[0]! : null;
  }

  #keep(page: HudPage, r: RecordedRequest): void {
    if (!page.calls.has(r.id)) this.#seen.set(callKey(r), (this.#seen.get(callKey(r)) ?? 0) + 1);
    page.calls.set(r.id, r);
    if (r.profiled && !r.server && finished(r)) this.#waiting.set(r.id, page);
    else this.#waiting.delete(r.id);
    if (page.calls.size <= MAX_CALLS) return;
    page.calls.delete(page.calls.keys().next().value!);
    page.dropped++;
  }
}
