import type { Recorder } from "../recorder-types.js";
import { h } from "./dom.js";
import { dashboardOf } from "../cloud.js";
import { dashLink, panelBar } from "./parts.js";

export interface SettingsActions {
  setLive(on: boolean): void;
  /** Move the HUD to the bottom left (true) or the bottom right. */
  setLeft(on: boolean): void;
  /** Forget the calls of the page on screen. */
  clear(): void;
  close(): void;
}

/** HUD settings only. Everything else is in the dashboard. */
export function settings(recorder: Recorder, s: { live: boolean; left: boolean }, slowMs: number, a: SettingsActions): HTMLElement {
  const checked = (e: Event) => (e.target as HTMLInputElement).checked;
  return h(
    "section",
    { key: "settings", class: "wl-panel wl-settings", "aria-label": "WizeLens settings" },
    panelBar(() => a.close(), h("span", { class: "wl-panel-title" }, "Settings")),
    h(
      "div",
      { class: "wl-body" },
      h("label", { class: "wl-switch" }, h("input", { type: "checkbox", checked: s.live, onChange: (e: Event) => a.setLive(checked(e)) }), "Live: follow the page you are on"),
      h("label", { class: "wl-switch" }, h("input", { type: "checkbox", checked: s.left, onChange: (e: Event) => a.setLeft(checked(e)) }), "Show WizeLens bottom left"),
      h(
        "dl",
        { class: "wl-kv" },
        h("dt", null, "Slow request"),
        h("dd", null, `${slowMs} ms or more. Set it with `, h("code", { class: "wl-mono" }, "slowMs"), ", or ", h("code", { class: "wl-mono" }, "data-slow-ms"), " on the script tag."),
        h("dt", null, "Endpoint"),
        h("dd", { class: "wl-mono" }, recorder.endpointUrl),
        h("dt", null, "Session"),
        h("dd", { class: "wl-mono" }, recorder.sessionId),
      ),
      h(
        "div",
        { class: "wl-row-btns" },
        h("button", { type: "button", class: "wl-btn", onClick: () => a.clear() }, "Clear this page's calls"),
        dashLink(dashboardOf(recorder.endpointUrl), "Open the dashboard", "wl-btn"),
      ),
    ),
  );
}
