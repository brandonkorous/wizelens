import { DASHBOARD_ENV, ENABLED_ENV, envSwitch } from "@wizeworks/lens-core";
import type { WizeLensOptions } from "./types.js";

const production = (): boolean => process.env.NODE_ENV === "production";

/** On or off: the option, then WIZELENS_ENABLED, then on outside production. */
export const isEnabled = (o: WizeLensOptions): boolean => o.enabled ?? envSwitch(process.env, ENABLED_ENV) ?? !production();

/** Serve reads (dashboard, API, MCP): the option, then WIZELENS_DASHBOARD, then on outside production. */
export const servesDashboard = (o: WizeLensOptions): boolean => o.dashboard ?? envSwitch(process.env, DASHBOARD_ENV) ?? !production();

/** Environment variable that shows ("true") or hides ("false") the HUD on the HTML pages the add-on serves. */
export const HUD_ENV = "WIZELENS_HUD";

/** Put the HUD on served pages: the option, then WIZELENS_HUD, then on. It needs the dashboard too. */
export const hudOn = (o: WizeLensOptions): boolean => o.hud ?? envSwitch(process.env, HUD_ENV) ?? true;
