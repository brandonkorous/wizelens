import type { Attributes } from "@wizeworks/lens-core";
import { setBrowserRelease, setBrowserUser } from "./browser-span.js";
import { mountHud } from "./hud/element.js";
import { probeReadApi } from "./read-probe.js";
import { createRecorder, endpointUrlOf } from "./recorder.js";
import type { Recorder, RecorderOptions } from "./recorder-types.js";
import { type InstanceSource, register, registered, type RegisteredInstance, unregister } from "./registry.js";

export interface WizeLensOptions extends RecorderOptions {
  /** Turn capture on. Default true. Pass e.g. `import.meta.env.DEV`; off returns an instance that does nothing. */
  enabled?: boolean;
  /** The web app's version, kept on browser spans for release markers and so stacks find the right source maps. Default: what the build plugin set. */
  release?: string;
  /** The signed-in user, sent as `enduser.id` on every browser span. Change it later with `setUser`. */
  user?: string | null;
  /** The signed-in user's display name, sent as `user.full_name` for the Users page. */
  userName?: string | null;
  /** The in-page HUD. "auto" (default) asks `{endpoint}/api/info` once and shows it when the read API answers. `readServer` follows it unless set. */
  hud?: boolean | "auto";
  /** The HUD shows requests at or over this many ms as "warning". Default 500. */
  slowMs?: number;
}

/** A running WizeLens in the browser. */
export interface WizeLens {
  /** False when `enabled` was false or there is no page (server render): every call does nothing. */
  readonly enabled: boolean;
  /** The recorder behind this instance, or null when off. */
  readonly recorder: Recorder | null;
  /** Per-tab session id. Empty when off. */
  readonly sessionId: string;
  /** Record a route change. History API changes are seen on their own; call this from a router in hash mode or to name the path. */
  pageView(url?: string): void;
  /** Send an error in the current page view's trace. `attributes` go on its span, for example the component that threw. */
  captureError(error: unknown, attributes?: Attributes): void;
  /** Put this user (`enduser.id`, and `user.full_name` when a name is given) on every browser span from now on. Null clears it. */
  setUser(id: string | null, options?: { name?: string | null }): void;
  /** Send queued spans now. */
  flush(): Promise<void>;
  /** Stop capture and the HUD, send what is queued, and restore `fetch`. A later `initWizeLens` starts again. */
  shutdown(): Promise<void>;
}

let active: { lens: WizeLens; entry: RegisteredInstance } | null = null;

function disabled(): WizeLens {
  return {
    enabled: false,
    recorder: null,
    sessionId: "",
    pageView: () => {},
    captureError: () => {},
    setUser: () => {},
    flush: async () => {},
    shutdown: async () => {},
  };
}

/** Show the HUD now, or when the probe answers yes. Returns a function that takes it away. */
function startHud(recorder: Recorder, show: boolean | Promise<boolean>, slowMs: number | undefined): () => void {
  let unmount: (() => void) | null = null;
  let stopped = false;
  const mount = (on: boolean) => void (on && !stopped && (unmount = mountHud(recorder, { slowMs })));
  if (typeof show === "boolean") mount(show);
  else void show.then(mount);
  return () => {
    stopped = true;
    unmount?.();
    unmount = null;
  };
}

function start(options: WizeLensOptions, source: InstanceSource): { lens: WizeLens; entry: RegisteredInstance } {
  const { enabled: _on, release, user, userName, hud = "auto", slowMs, ...rest } = options;
  setBrowserRelease(release ?? rest.version);
  setBrowserUser(user, userName);
  // Asked before install, so the probe is not traced. No HUD reads nothing back: send-only servers work as they are.
  const showHud = hud === "auto" ? probeReadApi(endpointUrlOf(rest.endpoint), globalThis.fetch) : hud;
  const recorder = createRecorder({ ...rest, readServer: rest.readServer ?? showHud, version: release ?? rest.version });
  const uninstall = recorder.install();
  const stopHud = startHud(recorder, showHud, slowMs);
  const lens: WizeLens = {
    enabled: true,
    recorder,
    sessionId: recorder.sessionId,
    pageView: (url) => recorder.pageView(url),
    captureError: (error, attributes) => recorder.captureError(error, attributes),
    setUser: (id, o) => setBrowserUser(id, o?.name),
    flush: () => recorder.flush(),
    async shutdown() {
      if (active?.lens === lens) active = null;
      unregister(entry);
      stopHud();
      uninstall();
      // Page capture stops on the next tick (it rides out a quick stop and start); its last view is queued then.
      await new Promise((r) => setTimeout(r, 1));
      await recorder.flush();
    },
  };
  const entry: RegisteredInstance = { source, stop: () => lens.shutdown() };
  register(entry);
  return { lens, entry };
}

// An app instance stops an injected one and takes over. Anything else keeps the instance that runs.
function takeOver(source: InstanceSource): boolean {
  const held = registered();
  if (!held) return true;
  if (held.source === "app" || source === "inject") return false;
  void held.stop();
  return true;
}

/** Start an instance for `source`. One instance per page: see `initWizeLens`. */
export function startWizeLens(options: WizeLensOptions, source: InstanceSource): WizeLens {
  const replaces = active?.entry.source === "inject" && source === "app";
  if (active && !replaces) return active.lens;
  if (options.enabled === false || typeof window === "undefined" || typeof globalThis.fetch !== "function") return disabled();
  if (!takeOver(source)) return disabled();
  active = start(options, source);
  return active.lens;
}

/** Start WizeLens on this page: traces fetch and XHR calls, page views, Web Vitals, errors, console lines, and the HUD. Calling it again returns the running instance; it takes over from a script a server injected. */
export function initWizeLens(options: WizeLensOptions = {}): WizeLens {
  return startWizeLens(options, "app");
}

/** The running instance, or null before `initWizeLens`. */
export const currentWizeLens = (): WizeLens | null => active?.lens ?? null;

/** An instance as given, or the running one, or a new one started with these options. For framework helpers. */
export function asWizeLens(from?: WizeLens | WizeLensOptions): WizeLens {
  if (from && typeof (from as WizeLens).captureError === "function") return from as WizeLens;
  return active?.lens ?? initWizeLens(from as WizeLensOptions | undefined);
}
