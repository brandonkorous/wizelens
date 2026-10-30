import { useState } from "react";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { TIME_RANGES } from "@wizeworks/lens-core/internal";
import { useHost, useRange } from "../data/host";
import { type Period, parseWindow, setComparePref, setWindowPref, useComparePref, useWindowPref } from "../data/period";
import { fmtDateTime, isUtc } from "../format";
import { Menu } from "./Menu";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-19T14:05" for a datetime-local input, in the chosen zone. */
function toInput(ms: number): string {
  const d = new Date(isUtc() ? ms : ms - new Date(ms).getTimezoneOffset() * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Epoch ms from a datetime-local value, read in the chosen zone. */
function fromInput(v: string): number {
  const utc = Date.parse(`${v}:00Z`);
  return isUtc() ? utc : utc + new Date(utc).getTimezoneOffset() * 60_000;
}

/** Two date-time fields and Apply: a window that ends in the past, or a span longer than the presets. */
function CustomRange({ current, onDone }: { current: Period | null; onDone: () => void }) {
  const now = Date.now();
  const [from, setFrom] = useState(toInput(current?.from ?? now - 3_600_000));
  const [to, setTo] = useState(toInput(current?.to ?? now));
  const w = { from: fromInput(from), to: Math.min(fromInput(to), now) };
  const valid = Number.isFinite(w.from) && Number.isFinite(w.to) && w.to - w.from >= 60_000;
  return (
    <form className="wl-range-custom" onSubmit={(e) => (e.preventDefault(), valid && (setWindowPref(w), onDone()))}>
      <label>
        From <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label>
        To <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <button type="submit" className="wl-btn" disabled={!valid}>
        Apply
      </button>
    </form>
  );
}

const COMPARES = [["previous", "The period before"], ["week", "Same time last week"]] as const;

/** Preset ranges, a custom window, and what the numbers compare with. */
export function RangeMenu() {
  const [range, setRange] = useRange();
  const { ranges } = useHost();
  const [windowText] = useWindowPref();
  const [compare] = useComparePref();
  const custom = parseWindow(windowText);
  const text = custom ? `${fmtDateTime(custom.from)} – ${fmtDateTime(custom.to)}` : TIME_RANGES[range].label;
  const label = (
    <>
      <Calendar aria-hidden="true" />
      <span className="wl-label">{text}</span>
      <ChevronDown aria-hidden="true" />
    </>
  );
  const item = (active: boolean, text: string, pick: () => void) => (
    <button key={text} type="button" className={`wl-menu-item${active ? " wl-active" : ""}`} onClick={pick}>
      <span className="wl-truncate">{text}</span>
      {active && <Check size={14} aria-hidden="true" className="wl-menu-check" />}
    </button>
  );
  return (
    <Menu label={label} title="Time range">
      {(close) => (
        <>
          {ranges.map((r) => item(!custom && r === range, TIME_RANGES[r].label, () => (setWindowPref(null), setRange(r), close())))}
          <div className="wl-menu-head">Custom range</div>
          <CustomRange current={custom} onDone={close} />
          <div className="wl-menu-head">Compare with</div>
          {COMPARES.map(([c, t]) => item(compare === c, t, () => (setComparePref(c), close())))}
        </>
      )}
    </Menu>
  );
}
