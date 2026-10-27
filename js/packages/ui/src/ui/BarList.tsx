import type { ReactNode } from "react";
import { pressable } from "./pressable";

export interface BarItem {
  key?: string;
  label: ReactNode;
  value: number;
  /** Text on the right, for example "184 ms". */
  display: ReactNode;
  /** CSS color of the bar. Default: brand blue. */
  color?: string;
  /** Text between the label and the bar, for example "32%". */
  share?: ReactNode;
  /** Makes the row a button, for example to filter by it. */
  onClick?: () => void;
}

/** Horizontal bars, scaled to the largest value (or to `max`). */
export function BarList({ items, max, compact = false }: { items: BarItem[]; max?: number; compact?: boolean }) {
  const top = max ?? Math.max(0, ...items.map((i) => i.value));
  return (
    <div className="wl-bars">
      {items.map((item, idx) => {
        const width = top > 0 ? Math.max(1.5, (item.value / top) * 100) : 0;
        return (
          <div
            key={item.key ?? idx}
            className={`wl-bar-row${compact ? " wl-compact" : ""}${item.onClick ? " wl-clickable" : ""}`}
            {...(item.onClick ? pressable(item.onClick, "button") : {})}
          >
            <span className="wl-truncate" title={typeof item.label === "string" ? item.label : undefined}>{item.label}</span>
            {compact && <span className="wl-num wl-muted">{item.share}</span>}
            <div className="wl-bar-track">
              <i style={{ width: `${width}%`, background: item.color }} />
            </div>
            {!compact && <span className="wl-value">{item.display}</span>}
          </div>
        );
      })}
    </div>
  );
}
