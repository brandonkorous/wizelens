import type { Attributes } from "@wizeworks/lens-core";
import { setBrowserRelease, setBrowserUser } from "./browser-span.js";
import { createRecorder } from "./recorder.js";
import type { Recorder, RecorderOptions } from "./recorder-types.js";

export interface WizeLensOptions extends RecorderOptions {
  /** Turn capture on. Default true. Pass e.g. `import.meta.env.DEV`; off returns an instance that does nothing. */
  enabled?: boolean;
  /** The web app's version, kept on browser spans for release markers and so stacks find the right source maps. Default: what the build plugin set. */
  release?: string;
  /** The signed-in user, sent as `enduser.id` on every browser span. Change it later with `setUser`. */
  user?: string | null;
  /** The signed-in user's display name, sent as `user.full_name` for the Users page. */
  userName?: string | null;
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
  /** Stop capture, send what is queued, and restore `fetch`. A later `initWizeLens` starts again. */
  shutdown(): Promise<void>;
}

let active: WizeLens | null = null;

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

function start(options: WizeLensOptions): WizeLens {
  const { enabled: _on, release, user, userName, ...rest } = options;
  setBrowserRelease(release ?? rest.version);
  setBrowserUser(user, userName);
  // No HUD here, so traces are not read back unless asked: send-only servers work as they are.
  const recorder = createRecorder({ readServer: false, ...rest, version: release ?? rest.version });
  const uninstall = recorder.install();
  const lens: WizeLens = {
    enabled: true,
    recorder,
    sessionId: recorder.sessionId,
    pageView: (url) => recorder.pageView(url),
    captureError: (error, attributes) => recorder.captureError(error, attributes),
    setUser: (id, o) => setBrowserUser(id, o?.name),
    flush: () => recorder.flush(),
    async shutdown() {
      if (active === lens) active = null;
      uninstall();
      // Page capture stops on the next tick (it rides out a quick stop and start); its last view is queued then.
      await new Promise((r) => setTimeout(r, 1));
      await recorder.flush();
    },
  };
  return lens;
}

/** Start WizeLens on this page: traces fetch and XHR calls, page views, Web Vitals, errors, and console lines. Calling it again returns the running instance. */
export function initWizeLens(options: WizeLensOptions = {}): WizeLens {
  if (active) return active;
  if (options.enabled === false || typeof window === "undefined" || typeof globalThis.fetch !== "function") return disabled();
  active = start(options);
  return active;
}

/** The running instance, or null before `initWizeLens`. */
export const currentWizeLens = (): WizeLens | null => active;

/** An instance as given, or the running one, or a new one started with these options. For framework helpers. */
export function asWizeLens(from?: WizeLens | WizeLensOptions): WizeLens {
  if (from && typeof (from as WizeLens).captureError === "function") return from as WizeLens;
  return active ?? initWizeLens(from as WizeLensOptions | undefined);
}
