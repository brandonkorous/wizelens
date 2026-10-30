// The period and time display choices: a custom from–to window, what numbers compare with, the time zone, and the clock.
import type { Compare } from "@wizeworks/lens-core/internal";
import { readPref, usePref, writePref } from "./prefs";

export const PERIOD_KEYS = { window: "wizelens.ui.window", compare: "wizelens.ui.compare", tz: "wizelens.ui.tz", clock: "wizelens.ui.clock" } as const;

export interface Period {
  from: number;
  to: number;
}

const isWindowText = (v: string): v is string => v === "" || /^\d+-\d+$/.test(v);
const isCompare = (v: string): v is Compare => v === "previous" || v === "week";
export type TimeZoneChoice = "local" | "utc";
export type ClockChoice = "12" | "24";
const isZone = (v: string): v is TimeZoneChoice => v === "local" || v === "utc";
const isClock = (v: string): v is ClockChoice => v === "12" || v === "24";

/** "1700000000000-1700003600000" as a window, or null. */
export function parseWindow(text: string | null): Period | null {
  const m = text ? /^(\d+)-(\d+)$/.exec(text) : null;
  const w = m ? { from: Number(m[1]), to: Number(m[2]) } : null;
  return w && w.to > w.from ? w : null;
}

export const windowText = (w: Period | null): string => (w ? `${Math.floor(w.from)}-${Math.floor(w.to)}` : "");

/** The custom window ("" for none) and what numbers compare with. */
export const useWindowPref = () => usePref<string>(PERIOD_KEYS.window, "", isWindowText);
export const useComparePref = () => usePref<Compare>(PERIOD_KEYS.compare, "previous", isCompare);
export const useTimeZonePref = () => usePref<TimeZoneChoice>(PERIOD_KEYS.tz, "local", isZone);
export const useClockPref = () => usePref<ClockChoice>(PERIOD_KEYS.clock, "12", isClock);

/** The custom window and compare choice now, for code outside React. */
export function getPeriod(): { window: Period | null; compare: Compare } {
  const compare = readPref(PERIOD_KEYS.compare);
  return { window: parseWindow(readPref(PERIOD_KEYS.window)), compare: compare === "week" ? "week" : "previous" };
}

/** Model parameters for the period: `from` and `to` for a custom window, `compare=week`. */
export function periodParams(window: Period | null, compare: Compare): Record<string, string> {
  return { ...(window ? { from: String(window.from), to: String(window.to) } : {}), ...(compare === "week" ? { compare } : {}) };
}

export const setWindowPref = (w: Period | null): void => writePref(PERIOD_KEYS.window, windowText(w));
export const setComparePref = (c: Compare): void => writePref(PERIOD_KEYS.compare, c);
