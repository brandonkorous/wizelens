import type { Recorder } from "../recorder-types.js";
import { h } from "./dom.js";
import { dashLink, panelBar } from "./parts.js";

export interface SettingsActions {
  setLive(on: boolean): void;
  /** Forget the calls of the page on screen. */
  clear(): void;
  close(): void;
}

/** HUD settings only. Everything else is in the dashboard. */
export function settings(recorder: Recorder, live: boolean, slowMs: number, a: SettingsActions): HTMLElement {
  const onChange = (e: Event) => a.setLive((e.target as HTMLInputElement).checked);
  return h(
    "section",
    { key: "settings", class: "wl-panel wl-settings", "aria-label": "WizeLens settings" },
    panelBar(() => a.close(), h("span", { class: "wl-panel-title" }, "Settings")),
    h(
      "div",
      { class: "wl-body" },
      h("label", { class: "wl-switch" }, h("input", { type: "checkbox", checked: live, onChange }), "Live: follow the page you are on"),
      h(
        "dl",
        { class: "wl-kv" },
        h("dt", null, "Slow request"),
        h("dd", null, `${slowMs} ms or more. Set it with the `, h("code", { class: "wl-mono" }, "slowMs"), " option."),
        h("dt", null, "Endpoint"),
        h("dd", { class: "wl-mono" }, recorder.endpointUrl),
        h("dt", null, "Session"),
        h("dd", { class: "wl-mono" }, recorder.sessionId),
      ),
      h(
        "div",
        { class: "wl-row-btns" },
        h("button", { type: "button", class: "wl-btn", onClick: () => a.clear() }, "Clear this page's calls"),
        dashLink(`${recorder.endpointUrl}/`, "Open the dashboard", "wl-btn"),
      ),
    ),
  );
}
