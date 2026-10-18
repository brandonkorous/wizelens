/** Environment variable that turns WizeLens on ("true") or off ("false"). It wins over the NODE_ENV default. */
export const ENABLED_ENV = "WIZELENS_ENABLED";
/** Environment variable that serves ("true") or hides ("false") the dashboard, the read API, and MCP. */
export const DASHBOARD_ENV = "WIZELENS_DASHBOARD";

const ON = new Set(["true", "1", "on", "yes"]);
const OFF = new Set(["false", "0", "off", "no"]);

/** Reads an on/off variable. Undefined when it is not set or not a known word. */
export function envFlag(value: string | undefined): boolean | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (ON.has(v)) return true;
  return OFF.has(v) ? false : undefined;
}
