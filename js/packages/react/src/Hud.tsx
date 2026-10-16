import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { DEFAULT_SLOW_MS } from "@wizeworks/lens-core";
import { Card } from "./Card.js";
import { Details } from "./Details.js";
import { useEscape, useFlag, useInjectedStyle, usePageStats, useStored } from "./hud-hooks.js";
import { currentRequest, fmtMs, type RequestView, requestView } from "./hud-model.js";
import { ApertureMark } from "./icons.js";
import { dashboardLink, isPanel, type Panel } from "./panel-parts.js";
import type { RecordedRequest, Recorder } from "./recorder-types.js";
import { Settings } from "./Settings.js";

const KEYS = { panel: "wizelens.hud.panel", live: "wizelens.hud.live", min: "wizelens.hud.min" };
const isPanelOrNone = (v: string): v is Panel | "" => v === "" || isPanel(v);

export interface HudProps {
  recorder: Recorder;
  /** Requests at or over this many ms show as "warning". Default 500. */
  slowMs?: number;
}

function useHudState(recorder: Recorder, slowMs: number) {
  const requests = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot, recorder.getSnapshot);
  const [panel, setPanel] = useStored<Panel | "">(KEYS.panel, "", isPanelOrNone);
  const [live, setLive] = useFlag(KEYS.live, true);
  const [minimized, setMinimized] = useFlag(KEYS.min, false);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const req = currentRequest(requests, live, pinnedId);
  // Rows restored after a refresh have summary counts only. Load the full stats for the one on screen.
  const restoredId = req?.restored && req.server?.insights == null ? req.traceId : null;
  useEffect(() => {
    if (restoredId) void recorder.loadServerStats(restoredId);
  }, [recorder, restoredId]);
  const closePanel = useCallback(() => setPanel(""), [setPanel]);
  useEscape(panel !== "", closePanel);
  const toggleLive = (on: boolean) => {
    if (on) return setLive(true);
    setPinnedId(req?.id ?? null);
    setLive(false);
  };
  return {
    req,
    view: requestView(req, slowMs),
    busy: requests.some((r) => r.durationMs === null && !r.error),
    panel,
    setPanel,
    closePanel,
    live,
    toggleLive,
    minimized,
    setMinimized,
  };
}

function Mini({ req, view, busy, onOpen }: { req: RecordedRequest | null; view: RequestView; busy: boolean; onOpen: () => void }) {
  return (
    <div className="wl-hud" role="complementary" aria-label="WizeLens">
      <button
        type="button"
        className={`wl-mini wl-h-${view.health}${busy ? " wl-busy" : ""}`}
        onClick={onOpen}
        title={req ? `WizeLens · ${req.method} ${req.path} · ${fmtMs(view.totalMs)}` : "WizeLens"}
        aria-label="Show WizeLens"
      >
        <ApertureMark size={30} blades="#F5F6F8" />
      </button>
    </div>
  );
}

export function Hud({ recorder, slowMs = DEFAULT_SLOW_MS }: HudProps) {
  useInjectedStyle();
  const page = usePageStats();
  const s = useHudState(recorder, slowMs);
  if (s.minimized) return <Mini req={s.req} view={s.view} busy={s.busy} onOpen={() => s.setMinimized(false)} />;
  const req = s.req;
  return (
    <div className="wl-hud" role="complementary" aria-label="WizeLens">
      {s.panel === "details" && <Details recorder={recorder} req={req} view={s.view} page={page} onClose={s.closePanel} />}
      {s.panel === "settings" && <Settings recorder={recorder} live={s.live} slowMs={slowMs} onLive={s.toggleLive} onClose={s.closePanel} />}
      <Card
        req={req}
        view={s.view}
        busy={s.busy}
        live={s.live}
        panel={s.panel}
        link={(v) => (req?.profiled ? dashboardLink(recorder, req, v) : null)}
        onDetails={() => s.setPanel("details")}
        onToggle={(p) => s.setPanel(s.panel === p ? "" : p)}
        onToggleLive={() => s.toggleLive(!s.live)}
        onMinimize={() => s.setMinimized(true)}
      />
    </div>
  );
}

// The render profiler skips the HUD, so it does not count its own renders.
(Hud as { __wizelens?: boolean }).__wizelens = true;
