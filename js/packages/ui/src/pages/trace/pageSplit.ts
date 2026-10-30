import { ATTR_PAGE, type Trace } from "@wizeworks/lens-core/internal";
import { fmtMs } from "../../format";

/** One part of the split bar: color class, label, ms. */
export type Part = [string, string, number];

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A page load with no server of yours in it, split by the browser's own clock (Rendering's words); null for other traces. */
export function pageParts(trace: Trace, totalMs: number): { parts: Part[]; note: string } | null {
  const root = trace.spans.find((s) => s.parentSpanId === null && s.category === "browser");
  const a = root?.attributes ?? {};
  const host = num(a[ATTR_PAGE.ttfbMs]);
  const text = num(a[ATTR_PAGE.fcpMs]);
  if (host === null || text === null) return null;
  const ready = Math.max(num(a[ATTR_PAGE.lcpMs]) ?? num(a[ATTR_PAGE.loadMs]) ?? text, text);
  const parts: Part[] = [
    ["wl-c-other", "Waiting for the host", host],
    ["wl-c-paint", "Until text showed", Math.max(0, text - host)],
    ["wl-c-render", "Until main content showed", Math.max(0, ready - text)],
  ];
  const rest = totalMs - Math.max(ready, host);
  if (rest >= 1) parts.push(["wl-c-rest", "After that", rest]);
  const images = num(a[ATTR_PAGE.imageMs]);
  const slow = images !== null && images > 0 ? ` The slowest picture took ${fmtMs(images)} to download.` : "";
  return { parts, note: `No server of yours is in this trace, so the time is split by the browser's own clock.${slow}` };
}
