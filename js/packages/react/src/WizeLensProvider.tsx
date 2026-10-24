import { createContext, type ReactNode, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { type RecordedRequest, type Recorder, setBrowserApp, setBrowserRelease, setBrowserUser } from "@wizeworks/lens-browser";
import { Hud } from "./Hud.js";
import { claimPage } from "./page-instance.js";
import { createRecorder } from "./react-capture.js";

const WizeLensContext = createContext<Recorder | null>(null);

export interface WizeLensProviderProps {
  /** WizeLens base path or URL on your API. Default "/_wizelens". */
  endpoint?: string;
  /** Turn profiling on. Default true. Pass e.g. `import.meta.env.DEV`. */
  enabled?: boolean;
  /** Show the in-page HUD (the shared `<wizelens-hud>` element). Default true. Off also stops reading traces back, so it works with a send-only server. */
  hud?: boolean;
  /** Which requests get a `traceparent` header. Default: same origin only. */
  propagateTo?: (url: URL) => boolean;
  /** The HUD shows requests at or over this many ms as "warning". Default 500. */
  slowMs?: number;
  /** Send page views, React render stats, and browser errors. Default true. */
  capturePages?: boolean;
  /** Copy `console.*` calls into the page view's trace. Default true. */
  captureConsole?: boolean;
  /** The web app's version, kept on browser spans for release markers and version compares, and so browser stacks find the right source maps. Default: what the build plugin set. */
  release?: string;
  /** The web app's name, so it gets its own Services row ("shop (browser)") in place of "Web App". */
  service?: string;
  /** Read this page's source maps (dev servers serve them) so errors group by source. Default true. */
  resolveFrames?: boolean;
  /** The signed-in user, sent as `enduser.id` on every browser span, so the Users page counts their requests. */
  user?: string | null;
  /** The signed-in user's display name, sent as `user.full_name`. */
  userName?: string | null;
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
  service,
  resolveFrames = true,
  user,
  userName,
  children,
}: WizeLensProviderProps) {
  const recorder = useMemo(
    () => (enabled ? createRecorder({ endpoint, propagateTo, capturePages, captureConsole, readServer: hud, version: release, resolveFrames }) : null),
    // propagateTo is read once on purpose; pass a stable function.
    [endpoint, enabled, capturePages, captureConsole, hud, release, resolveFrames],
  );

  // Before install, so the first page load already carries the release.
  useEffect(() => setBrowserRelease(release), [release]);
  useEffect(() => setBrowserApp(service), [service]);
  useEffect(() => setBrowserUser(user, userName), [user, userName]);
  // Set when another copy of WizeLens stops this one through the page registry.
  const [stopped, setStopped] = useState<Recorder | null>(null);
  useEffect(() => (recorder ? claimPage(recorder, () => setStopped(recorder)) : undefined), [recorder]);

  return (
    <WizeLensContext.Provider value={recorder}>
      {children}
      {recorder && hud && stopped !== recorder && <Hud recorder={recorder} slowMs={slowMs} />}
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
