import { useState } from "react";

/** How many names a phone shows before the rest fold behind a button. */
const PHONE_SHOWN = 4;

interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
}

/** A chart's line names. On a phone, more than four fold behind "Show all"; wider screens show them all. */
export function ChartLegend({ series }: { series: readonly LegendItem[] }) {
  const [open, setOpen] = useState(false);
  const folds = series.length > PHONE_SHOWN;
  return (
    <div className={`wl-chart-legend${folds && !open ? " wl-legend-folded" : ""}`}>
      {series.map((s) => (
        <span key={s.label} title={s.label}>
          <i className={s.dashed ? "wl-legend-dashed" : undefined} style={{ background: s.dashed ? undefined : s.color, borderColor: s.color }} />
          <span className="wl-legend-text">{s.label}</span>
        </span>
      ))}
      {folds && (
        <button type="button" className="wl-link-btn wl-legend-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Show fewer" : `Show all ${series.length}`}
        </button>
      )}
    </div>
  );
}
