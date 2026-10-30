// The HUD's "auto" mode: show it when the server's read API answers, as in development.
import { isCloudBrowserEndpoint } from "./cloud.js";
import { ownHudChoice } from "./hud-switch.js";
import { endpointUrlOf } from "./recorder.js";

const PROBE_TIMEOUT_MS = 5000;

/** Ask `GET {endpointUrl}/api/info` once. True when it answers 200 with a JSON object (an app's HTML fallback page is not one). */
export async function probeReadApi(endpointUrl: string, get: typeof fetch | undefined, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  if (typeof get !== "function") return false;
  const abort = typeof AbortController === "function" ? new AbortController() : null;
  const timer = abort ? setTimeout(() => abort.abort(), timeoutMs) : null;
  try {
    const res = await get(`${endpointUrl}/api/info`, { headers: { Accept: "application/json" }, signal: abort?.signal });
    if (res.status !== 200) return false;
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null && !Array.isArray(body);
  } catch {
    // Server down, not JSON, or too slow: no HUD.
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Whether to show the HUD. "auto" asks the read API once, except on a cloud browser key or when this browser chose with `?wizelens-hud=`. */
export function hudChoice(endpoint: string | undefined, hud: boolean | "auto"): boolean | Promise<boolean> {
  if (hud !== "auto") return hud;
  if (typeof window === "undefined") return false;
  const url = endpointUrlOf(endpoint);
  return ownHudChoice() ?? (!isCloudBrowserEndpoint(url) && probeReadApi(url, globalThis.fetch));
}
