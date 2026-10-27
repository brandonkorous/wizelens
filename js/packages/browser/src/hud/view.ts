import { fmtMs } from "../hud-model.js";
import type { Recorder } from "../recorder-types.js";
import { card, type CardActions, type CardModel } from "./card.js";
import { details, type DetailsModel } from "./details.js";
import { h } from "./dom.js";
import { apertureMark } from "./icons.js";
import { dashboardLink } from "./parts.js";
import { settings, type SettingsActions } from "./settings.js";
import type { HudSnapshot } from "./page-summary.js";
import type { HudSettings } from "./storage.js";

export interface HudViewModel {
  recorder: Recorder;
  snap: HudSnapshot;
  settings: HudSettings;
  slowMs: number;
  /** The page's call count and kind, for the tips. */
  page: CardModel["page"];
  /** The details panel's data. Null while the panel is closed. */
  details: DetailsModel | null;
}

export interface HudActions extends CardActions, SettingsActions {
  /** Leave the minimized aperture. */
  open(): void;
}

function mini({ snap }: HudViewModel, a: HudActions): HTMLElement {
  const { req, view, busy } = snap;
  const title = req ? `WizeLens · ${req.method} ${req.path} · ${fmtMs(view.totalMs)}` : "WizeLens";
  const cls = `wl-mini wl-h-${view.health}${busy ? " wl-busy" : ""}`;
  return h("button", { key: "mini", type: "button", class: cls, onClick: () => a.open(), title, "aria-label": "Show WizeLens" }, apertureMark(30, "#F5F6F8"));
}

function full(m: HudViewModel, a: HudActions): HTMLElement[] {
  const { recorder, snap } = m;
  const req = snap.req;
  const link = (v?: Parameters<Recorder["traceLink"]>[1]) => (req?.profiled ? dashboardLink(recorder, req, v) : null);
  const panel = m.settings.panel;
  const cardEl = card({ req, view: snap.view, busy: snap.busy, live: m.settings.live, panel, link, page: m.page }, a);
  if (panel === "details" && m.details) return [details(m.details, () => a.close()), cardEl];
  if (panel === "settings") return [settings(recorder, m.settings, m.slowMs, a), cardEl];
  return [cardEl];
}

/** The whole HUD: the minimized aperture, or the card with the open panel above it. */
export function hudView(m: HudViewModel, a: HudActions): HTMLElement {
  return h("div", { class: m.settings.left ? "wl-hud wl-left" : "wl-hud", role: "complementary", "aria-label": "WizeLens" }, m.settings.minimized ? mini(m, a) : full(m, a));
}
