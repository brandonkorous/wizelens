import { analyzeTrace, type Finding, type Trace } from "@wizeworks/lens-core";
import { pageLoadRequest } from "../document-request.js";
import { createPageMonitor, EMPTY_PAGE_STATS, type PageStats } from "../page.js";
import { afterNextPaint } from "../paint.js";
import type { RecordedRequest, Recorder } from "../recorder-types.js";
import { watchRoutes } from "../routes.js";
import { now } from "../session.js";
import type { DetailsModel } from "./details.js";
import { morphChildren } from "./dom.js";
import { type HudPage, PageLog } from "./page-log.js";
import { type HudSnapshot, summarizePage } from "./page-summary.js";
import { dashboardLink, traceIdOf, watchTrace } from "./parts.js";
import { type HudSettings, type Panel, readSettings, subscribeStored, writeLeft, writeLive, writeMinimized, writePanel } from "./storage.js";
import { type HudActions, hudView } from "./view.js";
import { pageRows } from "./waterfall.js";

// Traces loaded for the details panel: the page's own, and its calls with errors or insights.
const MAX_TRACES = 10;

const flagged = (r: RecordedRequest) => !!r.error || (r.status ?? 0) >= 500 || (r.server?.insights ?? 0) > 0 || (r.server?.errorCount ?? 0) > 0;
const href = () => (typeof location === "undefined" ? "http://localhost/" : location.href);
const origin = () => (typeof performance === "undefined" ? Date.now() : performance.timeOrigin);

/** Runs one HUD in `root`: follows the page and its calls, keeps the settings, and patches the DOM when something changes. */
export class HudController implements HudActions {
  readonly #recorder: Recorder;
  readonly #root: Node;
  readonly #slowMs: () => number;
  readonly #log = new PageLog(href(), origin());
  #settings: HudSettings = readSettings();
  #page: HudPage = this.#log.current;
  #pinnedId: number | null = null;
  #pausedAt: number | null = null;
  #vitals: PageStats = EMPTY_PAGE_STATS;
  #stops: (() => void)[] = [];
  #queued = false;
  #running = false;
  #traces = new Map<string, { trace: Trace | null; stop: () => void }>();
  #findings = new WeakMap<Trace, Finding[]>();

  constructor(recorder: Recorder, root: Node, slowMs: () => number) {
    this.#recorder = recorder;
    this.#root = root;
    this.#slowMs = slowMs;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    const monitor = createPageMonitor();
    const onKey = (e: Event) => (e as KeyboardEvent).key === "Escape" && this.#settings.panel !== "" && this.close();
    if (typeof addEventListener === "function") addEventListener("keydown", onKey);
    this.#stops = [
      // Take rows at once: a burst of calls can push older rows out before the next render.
      this.#recorder.subscribe(() => (this.#take(), this.queue())),
      subscribeStored(() => this.queue()),
      monitor.subscribe(() => ((this.#vitals = monitor.getSnapshot()), this.queue())),
      watchRoutes(() => this.#navigate()),
      () => monitor.stop(),
      () => typeof removeEventListener === "function" && removeEventListener("keydown", onKey),
    ];
    this.#vitals = monitor.getSnapshot();
    this.#take();
    this.render();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#stops.forEach((s) => s());
    this.#stops = [];
    this.#watch([]);
    morphChildren(this.#root, []);
  }

  /** Render once at the end of this task, however many updates came in. */
  queue(): void {
    if (this.#queued || !this.#running) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      if (this.#running) this.render();
    });
  }

  render(): void {
    if (!this.#running) return;
    this.#settings = readSettings();
    const live = this.#settings.live;
    // Paused (also after a refresh): hold the page and its calls as they are now.
    this.#pausedAt = live ? null : (this.#pausedAt ?? now());
    const page = (this.#page = (!live && this.#log.find(this.#pinnedId)) || this.#log.current);
    this.#pinnedId = live ? null : page.id;
    const slowMs = this.#slowMs();
    const snap = summarizePage(page, pageLoadRequest, slowMs, live ? Infinity : this.#pausedAt!);
    const open = this.#settings.panel === "details" && !this.#settings.minimized;
    this.#watch(open ? this.#flaggedTraces(snap) : []);
    const info = { calls: snap.view.fetch ?? 0, navigation: page.navigation };
    const model = { recorder: this.#recorder, snap, settings: this.#settings, slowMs, page: info, details: open ? this.#details(snap) : null };
    const follow = this.#atBottom();
    morphChildren(this.#root, [hudView(model, this)]);
    const body = this.#callsBox();
    if (follow && body) body.scrollTop = body.scrollHeight;
  }

  #callsBox(): HTMLElement | null {
    return ((this.#root as ParentNode).querySelector?.(".wl-details .wl-body") as HTMLElement | null) ?? null;
  }

  // The user has the calls list at its end: keep it there, so new calls stay in view.
  #atBottom(): boolean {
    const body = this.#callsBox();
    return !!body && body.scrollHeight - body.scrollTop - body.clientHeight < 24;
  }

  details(): void {
    writePanel("details");
  }

  toggle(p: Panel): void {
    writePanel(this.#settings.panel === p ? "" : p);
  }

  close(): void {
    writePanel("");
  }

  clear(): void {
    this.#recorder.clear();
    this.#log.clear(this.#page);
    this.queue();
  }

  toggleLive(): void {
    this.setLive(!this.#settings.live);
  }

  setLive(on: boolean): void {
    this.#pinnedId = on ? null : this.#page.id;
    this.#pausedAt = on ? null : now();
    writeLive(on);
  }

  setLeft(on: boolean): void {
    writeLeft(on);
  }

  minimize(): void {
    writeMinimized(true);
  }

  open(): void {
    writeMinimized(false);
  }

  #take(): void {
    this.#log.take(this.#recorder.getSnapshot());
    if (this.#recorder.getServerStats) this.#log.fill((id) => this.#recorder.getServerStats!(id));
  }

  // A route change starts a new page. Its render time is the next paint.
  #navigate(): void {
    const page = this.#log.navigate(href(), origin() + (typeof performance === "undefined" ? 0 : performance.now()));
    if (!page) return;
    void afterNextPaint().then((at) => {
      if (at !== null) page.renderMs = Math.max(0, at - page.startMs);
      this.queue();
    });
    this.queue();
  }

  // The page's own trace, then the newest calls with errors or insights.
  #flaggedTraces(snap: HudSnapshot): string[] {
    const ids = snap.calls.filter((r) => r === snap.lead || flagged(r)).map(traceIdOf);
    return [...new Set(ids.filter((id): id is string => id !== null))].slice(-MAX_TRACES);
  }

  #watch(traceIds: string[]): void {
    for (const [id, w] of this.#traces) if (!traceIds.includes(id)) (w.stop(), this.#traces.delete(id));
    for (const id of traceIds) {
      if (this.#traces.has(id)) continue;
      const w = { trace: null as Trace | null, stop: () => {} };
      this.#traces.set(id, w);
      w.stop = watchTrace(this.#recorder, id, (t) => {
        if (t === w.trace) return;
        w.trace = t;
        this.queue();
      });
    }
  }

  #details(snap: HudSnapshot): DetailsModel {
    const findings = [...this.#traces.values()].flatMap(({ trace }) => {
      if (!trace) return [];
      if (!this.#findings.has(trace)) this.#findings.set(trace, analyzeTrace(trace));
      return this.#findings.get(trace)!;
    });
    const route = this.#page.navigation === "spa" ? this.#page : null;
    const callLink = (r: RecordedRequest) => (r.profiled ? this.#recorder.traceLink(r.traceId) : null);
    const rows = pageRows(snap.calls, snap.lead, route, callLink);
    const link = (v: Parameters<Recorder["traceLink"]>[1]) => dashboardLink(this.#recorder, snap.req, v);
    return { snap, page: this.#vitals, findings, rows, link };
  }
}
