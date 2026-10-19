import { createContext, type ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { setBrowserRelease } from "./browser-span.js";
import { Hud } from "./Hud.js";
import { createRecorder, type RecordedRequest, type Recorder } from "./recorder.js";

const WizeLensContext = createContext<Recorder | null>(null);

export interface WizeLensProviderProps {
  /** WizeLens base path or URL on your API. Default "/_wizelens". */
  endpoint?: string;
  /** Turn profiling on. Default true. Pass e.g. `import.meta.env.DEV`. */
  enabled?: boolean;
  /** Show the in-page HUD. Default true. Off also stops reading traces back, so it works with a send-only server. */
  hud?: boolean;
  /** Which requests get a `traceparent` header. Default: same origin only. */
  propagateTo?: (url: URL) => boolean;
  /** The HUD shows requests at or over this many ms as "warning". Default 500. */
  slowMs?: number;
  /** Send page views, React render stats, and browser errors. Default true. */
  capturePages?: boolean;
  /** Copy `console.*` calls into the page view's trace. Default true. */
  captureConsole?: boolean;
  /** The web app's version, kept on browser spans for release markers and version compares. For example `import.meta.env.VITE_APP_VERSION`. */
  release?: string;
  children?: ReactNode;
}

export function WizeLensProvider({
  endpoint = "/_wizelens",
  enabled = true,
  hud = true,
  propagateTo,
  slowMs,
  capturePages = true,
  captureConsole = true,
  release,
  children,
}: WizeLensProviderProps) {
  const recorder = useMemo(
    () => (enabled ? createRecorder({ endpoint, propagateTo, capturePages, captureConsole, readServer: hud }) : null),
    // propagateTo is read once on purpose; pass a stable function.
    [endpoint, enabled, capturePages, captureConsole, hud],
  );

  // Before install, so the first page load already carries the release.
  useEffect(() => setBrowserRelease(release), [release]);
  useEffect(() => recorder?.install(), [recorder]);

  return (
    <WizeLensContext.Provider value={recorder}>
      {children}
      {recorder && hud && <Hud recorder={recorder} slowMs={slowMs} />}
    </WizeLensContext.Provider>
  );
}

const EMPTY: readonly RecordedRequest[] = [];
const noopSubscribe = () => () => {};

/** Recent requests seen by WizeLens. Empty when WizeLens is off. */
export function useWizeLensRequests(): readonly RecordedRequest[] {
  const recorder = useContext(WizeLensContext);
  return useSyncExternalStore(
    recorder?.subscribe ?? noopSubscribe,
    recorder?.getSnapshot ?? (() => EMPTY),
    () => EMPTY,
  );
}

/** The active recorder, or null when WizeLens is off. */
export function useWizeLens(): Recorder | null {
  return useContext(WizeLensContext);
}
