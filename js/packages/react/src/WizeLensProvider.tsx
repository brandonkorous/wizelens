import { createContext, type ReactNode, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { hudChoice, type RecordedRequest, type Recorder, setBrowserApp, setBrowserRelease, setBrowserUser } from "@wizeworks/lens-browser/internal";
import { Hud } from "./Hud.js";
import { claimPage } from "./page-instance.js";
import { createReactRecorder } from "./react-capture.js";

const WizeLensContext = createContext<Recorder | null>(null);

export interface WizeLensProviderProps {
  /** WizeLens base path or URL on your API. Default "/_wizelens". */
  endpoint?: string;
  /** Turn profiling on. Default true. Pass e.g. `import.meta.env.DEV`. */
  enabled?: boolean;
  /** The in-page HUD (the shared `<wizelens-hud>` element). "auto" (default) shows it when `{endpoint}/api/info` answers. Off also stops reading traces back, so it works with a send-only server. */
  hud?: boolean | "auto";
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
  hud = "auto",
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
  const choice = useMemo(() => (enabled ? hudChoice(endpoint, hud) : false), [enabled, endpoint, hud]);
  const recorder = useMemo(
    () => (enabled ? createReactRecorder({ endpoint, propagateTo, capturePages, captureConsole, readServer: choice, release, resolveFrames }) : null),
    // propagateTo is read once on purpose; pass a stable function.
    [endpoint, enabled, capturePages, captureConsole, choice, release, resolveFrames],
  );
  const showHud = useResolved(choice);

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
      {recorder && showHud && stopped !== recorder && <Hud recorder={recorder} slowMs={slowMs} />}
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

/** A yes or no that may still be on its way; false until it arrives. */
function useResolved(value: boolean | Promise<boolean>): boolean {
  const [now, setNow] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve(value).then((v) => live && setNow(v));
    return () => void (live = false);
  }, [value]);
  return now;
}

/** The active recorder, or null when WizeLens is off. */
export function useWizeLensRecorder(): Recorder | null {
  return useContext(WizeLensContext);
}
