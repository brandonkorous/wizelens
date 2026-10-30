import { useEffect } from "react";
import { mountHud, type Recorder } from "@wizeworks/lens-browser/internal";

export interface HudProps {
  recorder: Recorder;
  /** Requests at or over this many ms show as "warning". Default 500. */
  slowMs?: number;
}

/** The in-page HUD for `recorder`: the shared `<wizelens-hud>` element, added after mount. Renders nothing, so server HTML matches. */
export function Hud({ recorder, slowMs }: HudProps): null {
  useEffect(() => mountHud(recorder, { slowMs }), [recorder, slowMs]);
  return null;
}

// The render profiler skips the HUD, so it does not count its own renders.
(Hud as { __wizelens?: boolean }).__wizelens = true;
