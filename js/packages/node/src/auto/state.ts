import type { AdapterParts } from "../adapters/registry.js";
import type { WizeLens } from "../types.js";

/** The auto install's link to this process. It lives on globalThis, so a second copy of the package finds it. */
export interface AutoHolder {
  /** The app made its own instance: the code install wins. `parts` is null when that instance is off. */
  codeInstall(wizelens: WizeLens, parts: AdapterParts | null): void;
}

const KEY = Symbol.for("wizeworks.wizelens.auto");
type Holder = { [KEY]?: AutoHolder };

/** The auto install of this process, if `--import @wizeworks/lens-node/auto` ran. */
export const autoHolder = (): AutoHolder | undefined => (globalThis as Holder)[KEY];

/** Claim the process for one auto install. False when another copy already did. */
export function claimAuto(holder: AutoHolder): boolean {
  const g = globalThis as Holder;
  if (g[KEY]) return false;
  g[KEY] = holder;
  return true;
}

/** Tell the auto install, if any, that the app installed WizeLens in code. */
export function noteCodeInstall(wizelens: WizeLens, parts: AdapterParts | null): void {
  autoHolder()?.codeInstall(wizelens, parts);
}
