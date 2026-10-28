// The HUD for one browser: `?wizelens-hud=on` on any page turns it on here and `off` turns it off, so a site's owner sees it and visitors do not.
import { readStored, writeStored } from "./hud/storage.js";

export const HUD_SWITCH_PARAM = "wizelens-hud";
const KEY = "wizelens.hud.mine";

/** This browser's own choice: from the address (kept for later pages), else from before; null when it never chose. */
export function ownHudChoice(search: string = globalThis.location?.search ?? ""): boolean | null {
  const asked = new URLSearchParams(search).get(HUD_SWITCH_PARAM);
  if (asked === "on" || asked === "off") writeStored(KEY, asked);
  const kept = readStored(KEY);
  return kept === "on" ? true : kept === "off" ? false : null;
}
