import { DashLink, PanelBar } from "./panel-parts.js";
import type { Recorder } from "@wizeworks/lens-browser";

export interface SettingsProps {
  recorder: Recorder;
  live: boolean;
  slowMs: number;
  onLive: (on: boolean) => void;
  onClose: () => void;
}

/** HUD settings only. Everything else is in the dashboard. */
export function Settings({ recorder, live, slowMs, onLive, onClose }: SettingsProps) {
  return (
    <section className="wl-panel wl-settings" aria-label="WizeLens settings">
      <PanelBar onClose={onClose}>
        <span className="wl-panel-title">Settings</span>
      </PanelBar>
      <div className="wl-body">
        <label className="wl-switch">
          <input type="checkbox" checked={live} onChange={(e) => onLive(e.target.checked)} />
          Live: always show the newest request
        </label>
        <dl className="wl-kv">
          <dt>Slow request</dt>
          <dd>
            {slowMs} ms or more. Set it with the <code className="wl-mono">slowMs</code> prop.
          </dd>
          <dt>Endpoint</dt>
          <dd className="wl-mono">{recorder.endpointUrl}</dd>
          <dt>Session</dt>
          <dd className="wl-mono">{recorder.sessionId}</dd>
        </dl>
        <div className="wl-row-btns">
          <button type="button" className="wl-btn" onClick={recorder.clear}>
            Clear the request list
          </button>
          <DashLink className="wl-btn" href={`${recorder.endpointUrl}/`}>
            Open the dashboard
          </DashLink>
        </div>
      </div>
    </section>
  );
}
