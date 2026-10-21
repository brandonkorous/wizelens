import { analyzeTrace, type Finding, type Trace } from "@wizeworks/lens-core";
import { createPageMonitor, EMPTY_PAGE_STATS, type PageStats } from "../page.js";
import type { RecordedRequest, Recorder } from "../recorder-types.js";
import type { DetailsModel } from "./details.js";
import { morphChildren } from "./dom.js";
import { dashboardLink, traceIdOf, watchTrace } from "./parts.js";
import { holdDelay, hudSnapshot, type HudSnapshot, pinOf, restoredIdOf } from "./snapshot.js";
import { type HudSettings, type Panel, readSettings, subscribeStored, writeLive, writeMinimized, writePanel } from "./storage.js";
import { type HudActions, hudView } from "./view.js";
import { waterfallRows, type WfRow } from "./waterfall.js";

/** Runs one HUD in `root`: reads the recorder, keeps the settings, and patches the DOM when something changes. */
export class HudController implements HudActions {
  readonly #recorder: Recorder;
  readonly #root: Node;
  readonly #slowMs: () => number;
  #settings: HudSettings = readSettings();
  #snap: HudSnapshot | null = null;
  #pinnedId: string | null = null;
  #page: PageStats = EMPTY_PAGE_STATS;
  #stops: (() => void)[] = [];
  #queued = false;
  #running = false;
  #holdTimer: ReturnType<typeof setTimeout> | null = null;
  #restoredId: string | null = null;
  #traceId: string | null = null;
  #trace: Trace | null = null;
  #stopTrace: () => void = () => {};
  #findings: { trace: Trace | null; list: Finding[] } = { trace: null, list: [] };
  #rows: { req: RecordedRequest | null; trace: Trace | null; list: WfRow[] } = { req: null, trace: null, list: [] };

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
      this.#recorder.subscribe(() => this.queue()),
      subscribeStored(() => this.queue()),
      monitor.subscribe(() => ((this.#page = monitor.getSnapshot()), this.queue())),
      () => monitor.stop(),
      () => typeof removeEventListener === "function" && removeEventListener("keydown", onKey),
    ];
    this.#page = monitor.getSnapshot();
    this.render();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#stops.forEach((s) => s());
    this.#stops = [];
    this.#setHold(null);
    this.#watch(null);
    this.#restoredId = null;
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
    const snap = (this.#snap = hudSnapshot(this.#recorder.getSnapshot(), this.#settings, this.#pinnedId, this.#slowMs()));
    this.#setHold(snap.held);
    const restoredId = restoredIdOf(snap.req);
    if (restoredId && restoredId !== this.#restoredId) void this.#recorder.loadServerStats(restoredId);
    this.#restoredId = restoredId;
    const open = this.#settings.panel === "details" && !this.#settings.minimized;
    this.#watch(open ? traceIdOf(snap.req) : null);
    const model = { recorder: this.#recorder, snap, settings: this.#settings, slowMs: this.#slowMs(), details: open ? this.#details(snap) : null };
    morphChildren(this.#root, [hudView(model, this)]);
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

  toggleLive(): void {
    this.setLive(!this.#settings.live);
  }

  setLive(on: boolean): void {
    if (!on && this.#snap) this.#pinnedId = pinOf(this.#snap);
    writeLive(on);
  }

  minimize(): void {
    writeMinimized(true);
  }

  open(): void {
    writeMinimized(false);
  }

  // Re-render when a held failure stops being held.
  #setHold(held: RecordedRequest | null): void {
    if (this.#holdTimer) clearTimeout(this.#holdTimer);
    this.#holdTimer = held ? setTimeout(() => this.queue(), holdDelay(held)) : null;
  }

  #watch(traceId: string | null): void {
    if (traceId === this.#traceId) return;
    this.#stopTrace();
    this.#stopTrace = () => {};
    this.#traceId = traceId;
    this.#trace = null;
    if (!traceId) return;
    this.#stopTrace = watchTrace(this.#recorder, traceId, (t) => {
      if (t === this.#trace) return;
      this.#trace = t;
      this.queue();
    });
  }

  #details(snap: HudSnapshot): DetailsModel {
    const { req } = snap;
    const trace = this.#trace;
    if (this.#findings.trace !== trace) this.#findings = { trace, list: trace ? analyzeTrace(trace) : [] };
    if (this.#rows.req !== req || this.#rows.trace !== trace) this.#rows = { req, trace, list: req ? waterfallRows(req, trace) : [] };
    const link = (v: Parameters<Recorder["traceLink"]>[1]) => dashboardLink(this.#recorder, req, v);
    return { req, view: snap.view, page: this.#page, trace, findings: this.#findings.list, rows: this.#rows.list, link };
  }
}
