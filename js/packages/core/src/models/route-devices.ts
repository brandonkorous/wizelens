// One route on phones, tablets, and desktops: views, when the text and the main content showed, and where the time went.
import { avgOfAgg } from "../scale/agg.js";
import type { DeviceMeasure } from "../scale/facts-render.js";
import { joinKey, splitKey } from "../scale/kinds.js";
import type { Need, NeedResults } from "../scale/needs.js";
import type { Device } from "../user-agent.js";
import { DEVICES } from "./render-devices.js";
export { READY_GOOD_MS, READY_POOR_MS } from "../page-findings.js";
import { groupNeed, rowsOf } from "./read.js";

/** Where most of the wait went: the server or file host, the page's code and styles before any text, the main content after it, or its images. */
export type SlowCause = "host" | "code" | "content" | "images";


export interface RouteDevice {
  device: Device;
  views: number;
  /** Averages over the views that measured each; null when none did. */
  ttfbMs: number | null;
  fcpMs: number | null;
  readyMs: number | null;
  imageMs: number | null;
  largeImages: number | null;
  cause: SlowCause | null;
}

export const routeDeviceNeeds = (route: string): Need[] => {
  const filter = { prefix: joinKey(route, "") };
  return [groupNeed("rdev", "pv.dev", "cur", { filter }), groupNeed("rdm", "pv.dm", "cur", { filter })];
};

/** The biggest of the three stretches of a load, with images named when they fill the last one. */
export function slowCauseOf(r: Omit<RouteDevice, "cause" | "device" | "views">): SlowCause | null {
  if (r.readyMs === null || r.ttfbMs === null || r.fcpMs === null) return null;
  const host = r.ttfbMs;
  const code = Math.max(0, r.fcpMs - r.ttfbMs);
  const content = Math.max(0, r.readyMs - r.fcpMs);
  if (host >= code && host >= content) return "host";
  if (code >= content) return "code";
  return (r.largeImages ?? 0) >= 1 || (r.imageMs ?? 0) >= content / 2 ? "images" : "content";
}

/** Each device that opened the route, phones first. */
export function routeDevicesOf(d: NeedResults): RouteDevice[] {
  const views = new Map(rowsOf(d, "rdev").map((r) => [splitKey(r.key)[1] as Device, r.agg.n]));
  const avg = new Map(rowsOf(d, "rdm").map((r) => [splitKey(r.key).slice(1).join("/"), avgOfAgg(r.agg)]));
  const of = (dev: Device, m: DeviceMeasure) => avg.get(`${dev}/${m}`) ?? null;
  return DEVICES.filter((dev) => (views.get(dev) ?? 0) > 0).map((dev) => {
    const large = of(dev, "large");
    const r = { ttfbMs: of(dev, "ttfb"), fcpMs: of(dev, "fcp"), readyMs: of(dev, "ready"), imageMs: of(dev, "image"), largeImages: large === null ? null : Math.round(large) };
    return { device: dev, views: views.get(dev)!, ...r, cause: slowCauseOf(r) };
  });
}
