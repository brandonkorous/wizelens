import { type AdapterParts, partsOf } from "../adapters/registry.js";
import { endpointOf } from "../hub-connect.js";
import type { WizeLens, WizeLensOptions } from "../types.js";
import { buildWizeLens } from "../wizelens.js";

/** The instance that gets the data now, and whether the auto install made it. */
export interface Owner {
  wizelens: WizeLens;
  parts: AdapterParts;
  auto: boolean;
}

let options: WizeLensOptions | null = null;
let auto: Owner | null = null;
let code: { wizelens: WizeLens; parts: AdapterParts | null } | null = null;

const log = (message: string) => console.info(`[wizelens] ${message}`);

/** Set the auto install's options. Nothing starts until the process serves or records something. */
export function configureAuto(o: WizeLensOptions): void {
  options = o;
}

function startAuto(o: WizeLensOptions): Owner | null {
  const wizelens = buildWizeLens(o);
  const parts = partsOf(wizelens);
  if (!parts) return null;
  const hub = endpointOf(o);
  log(`Auto install on for ${o.service}${hub ? `, sending to ${hub}` : ""}.`);
  return { wizelens, parts, auto: true };
}

/** The instance to use now: the app's own when it made one, else the auto instance, started on first use. Null when off. */
export function currentOwner(): Owner | null {
  if (code) return code.parts ? { wizelens: code.wizelens, parts: code.parts, auto: false } : null;
  if (!auto && options) {
    auto = startAuto(options);
    options = null;
  }
  return auto;
}

/** True when the auto instance gets the data, so the auto request hooks must capture. */
export const autoOwns = (): boolean => currentOwner()?.auto === true;

/** The app installed WizeLens in code. It wins: the auto instance stops, and the hooks hand their data to it. */
export function handOver(wizelens: WizeLens, parts: AdapterParts | null): void {
  if (code) return;
  code = { wizelens, parts };
  options = null;
  const stopped = auto;
  auto = null;
  log(`${wizelens.service} installs WizeLens in code, so the auto install steps aside.`);
  if (stopped) void stopped.wizelens.shutdown();
}

/** Forget every instance. For tests. */
export function resetOwner(): void {
  void auto?.wizelens.shutdown();
  options = null;
  auto = null;
  code = null;
}
