import { DASHBOARD_ENV, ENABLED_ENV, envFlag } from "@wizeworks/lens-core";
import type { WizeLensOptions } from "./types.js";

const production = (): boolean => process.env.NODE_ENV === "production";

/** On or off: the option, then WIZELENS_ENABLED, then on outside production. */
export const isEnabled = (o: WizeLensOptions): boolean => o.enabled ?? envFlag(process.env[ENABLED_ENV]) ?? !production();

/** Serve reads (dashboard, API, MCP): the option, then WIZELENS_DASHBOARD, then on outside production. */
export const servesDashboard = (o: WizeLensOptions): boolean => o.dashboard ?? envFlag(process.env[DASHBOARD_ENV]) ?? !production();
